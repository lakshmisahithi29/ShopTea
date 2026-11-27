import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { safeUserSelect } from '../utils/safeUser';
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../utils/errors';
import { parseDateInput } from '../utils/dateRange';
import { roundMoney, roundQty } from '../utils/numbers';
import { withReplenishmentFields } from './stockStatus';
import { syncItemStockAlert } from './stockAlert.service';
import {
  lockInventoryItem,
  normalizePurchaseCost,
  normalizeQuantity,
  StockService,
  validateTransactionCommon,
  type PurchaseDto,
} from './stock.service';

const purchaseInclude = {
  item: true,
  supplier: true,
  createdByUser: { select: safeUserSelect },
  cancelledByUser: { select: safeUserSelect },
  reversal: true,
  reversalOf: true,
} satisfies Prisma.StockTransactionInclude;

function getShopAndUser(shopId?: string, userId?: string) {
  if (!shopId) {
    throw new UnauthorizedError('Shop profile required. Please complete shop setup.');
  }
  return { shopId, userId };
}

function decimal(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function serializeTransaction(transaction: any): any {
  return {
    ...transaction,
    quantity: Number(transaction.quantity),
    unitCost: decimal(transaction.unitCost),
    totalCost: decimal(transaction.totalCost),
    inputQuantity: decimal(transaction.inputQuantity),
    inputUnitCost: decimal(transaction.inputUnitCost),
    item: transaction.item
      ? {
          ...transaction.item,
          openingStock: Number(transaction.item.openingStock),
          currentStock: Number(transaction.item.currentStock),
          unitCost: Number(transaction.item.unitCost),
          minStock: Number(transaction.item.minStock),
          reorderLevel: Number(transaction.item.reorderLevel),
          targetStock: Number(transaction.item.targetStock),
        }
      : null,
    reversal: transaction.reversal ? serializeTransaction(transaction.reversal) : null,
  };
}

function dateFilter(startDate?: string, endDate?: string): Prisma.StockTransactionWhereInput {
  if (!startDate && !endDate) return {};
  const from = startDate ? parseDateInput(startDate) : undefined;
  const to = endDate ? parseDateInput(endDate) : undefined;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
    throw new ValidationError('Invalid purchase date filter.');
  }
  if (from) from.setHours(0, 0, 0, 0);
  if (to) to.setHours(23, 59, 59, 999);
  if (from && to && from > to) throw new ValidationError('startDate must be on or before endDate.');
  return { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } };
}

async function recalculateAverageCost(tx: Prisma.TransactionClient, itemId: string, fallback: number) {
  const purchases = await tx.stockTransaction.findMany({
    where: { itemId, type: 'PURCHASE', status: 'ACTIVE' },
    select: { quantity: true, unitCost: true },
  });
  const totalQuantity = purchases.reduce((sum, purchase) => sum + Number(purchase.quantity), 0);
  if (totalQuantity <= 0) return fallback;
  const totalValue = purchases.reduce(
    (sum, purchase) => sum + Number(purchase.quantity) * Number(purchase.unitCost || 0),
    0,
  );
  return roundMoney(totalValue / totalQuantity);
}

async function validateSupplier(tx: Prisma.TransactionClient, shopId: string, supplierId?: string | null) {
  if (!supplierId) return;
  const supplier = await tx.supplier.findFirst({ where: { id: supplierId, shopId } });
  if (!supplier) throw new NotFoundError('Supplier not found in your shop.');
}

async function loadOriginalPurchase(tx: Prisma.TransactionClient, shopId: string, id: string) {
  const original = await tx.stockTransaction.findFirst({
    where: { id, shopId, type: 'PURCHASE' },
    include: purchaseInclude,
  });
  if (!original) throw new NotFoundError('Purchase not found in your shop.');
  if (original.status !== 'ACTIVE') throw new ConflictError('Only active purchases can be edited or cancelled.');
  if (original.reference === 'OPENING-STOCK') {
    throw new BadRequestError('Opening stock cannot be edited as a purchase. Record a stock adjustment instead.');
  }
  return original;
}

export class PurchaseService {
  static async create(shopId: string, userId: string, dto: PurchaseDto) {
    getShopAndUser(shopId, userId);
    const result = await StockService.recordPurchase(shopId, userId, dto);
    const transaction = serializeTransaction(result.transaction);
    return {
      ...result,
      transaction,
      purchase: transaction,
      updatedItem: 'updatedItem' in result && result.updatedItem
        ? withReplenishmentFields(result.updatedItem)
        : undefined,
    };
  }

  static async list(shopId: string, query: Record<string, any>) {
    getShopAndUser(shopId);
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);
    const where: Prisma.StockTransactionWhereInput = {
      shopId,
      type: 'PURCHASE',
      ...(query.status ? { status: query.status } : {}),
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...dateFilter(query.startDate, query.endDate),
    };

    const [purchases, total, aggregate] = await Promise.all([
      prisma.stockTransaction.findMany({
        where,
        include: purchaseInclude,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.stockTransaction.count({ where }),
      prisma.stockTransaction.aggregate({
        where: { ...where, status: 'ACTIVE' },
        _sum: { totalCost: true },
        _count: true,
      }),
    ]);

    return {
      purchases: purchases.map(serializeTransaction),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      summary: {
        activePurchaseCount: aggregate._count,
        activePurchaseValue: roundMoney(Number(aggregate._sum.totalCost || 0)),
        costMethod: 'WEIGHTED_AVERAGE',
      },
    };
  }

  static async getById(shopId: string, id: string) {
    getShopAndUser(shopId);
    const purchase = await prisma.stockTransaction.findFirst({
      where: { id, shopId, type: 'PURCHASE' },
      include: purchaseInclude,
    });
    if (!purchase) throw new NotFoundError('Purchase not found in your shop.');
    return serializeTransaction(purchase);
  }

  static async update(shopId: string, userId: string, id: string, dto: Omit<PurchaseDto, 'itemId'>) {
    getShopAndUser(shopId, userId);
    const replacementKey = `EDIT:${dto.idempotencyKey}:REPLACEMENT`;
    const reversalKey = `EDIT:${dto.idempotencyKey}:REVERSAL`;

    const result = await prisma.$transaction(async (tx) => {
      const retry = await tx.stockTransaction.findFirst({
        where: { shopId, idempotencyKey: replacementKey },
        include: purchaseInclude,
      });
      if (retry) return { purchase: retry, reversal: retry.reversal, isDuplicate: true };

      const original = await loadOriginalPurchase(tx, shopId, id);
      await lockInventoryItem(tx, original.itemId, shopId);
      const auditGroupId = crypto.randomUUID();
      const claimed = await tx.stockTransaction.updateMany({
        where: { id, shopId, status: 'ACTIVE' },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: userId,
          cancellationReason: 'Edited; replacement purchase created.',
          auditGroupId,
        },
      });
      if (claimed.count === 0) throw new ConflictError('Purchase was already modified. Please refresh.');

      const item = await tx.inventoryItem.findFirst({ where: { id: original.itemId, shopId } });
      if (!item) throw new NotFoundError('Inventory item not found in your shop.');
      const quantity = normalizeQuantity(item, dto.quantity, dto.inputUnit);
      const unitCost = normalizePurchaseCost(item, dto.unitCost, dto.inputUnit);
      validateTransactionCommon(item, quantity, dto.date);
      await validateSupplier(tx, shopId, dto.supplierId);

      const currentStock = Number(item.currentStock);
      const newStock = roundQty(currentStock - Number(original.quantity) + quantity);
      if (newStock < 0) {
        throw new BadRequestError('This edit would make inventory negative because some stock has already been consumed.');
      }
      if (newStock > 999_999_999.999) throw new BadRequestError('Updated stock exceeds the supported precision.');

      const reversal = await tx.stockTransaction.create({
        data: {
          shopId,
          itemId: original.itemId,
          type: 'REVERSAL',
          quantity: original.quantity,
          unitCost: original.unitCost,
          totalCost: original.totalCost,
          supplierId: original.supplierId,
          reference: `REVERSAL:${original.id}`,
          remarks: `Reversed edited purchase ${original.id}`,
          idempotencyKey: reversalKey,
          reversalOfId: original.id,
          auditGroupId,
          createdById: userId,
          inputUnit: original.inputUnit || item.unit,
          inputQuantity: original.inputQuantity || original.quantity,
          inputUnitCost: original.inputUnitCost || original.unitCost,
        },
      });

      const replacement = await tx.stockTransaction.create({
        data: {
          shopId,
          itemId: item.id,
          type: 'PURCHASE',
          quantity,
          unitCost,
          totalCost: roundMoney(dto.quantity * dto.unitCost),
          supplierId: dto.supplierId || null,
          reference: dto.reference || null,
          remarks: dto.remarks || null,
          idempotencyKey: replacementKey,
          auditGroupId,
          inputUnit: dto.inputUnit || item.unit,
          inputQuantity: dto.quantity,
          inputUnitCost: dto.unitCost,
          createdById: userId,
          date: dto.date ? parseDateInput(dto.date) : new Date(),
        },
        include: purchaseInclude,
      });

      const averageCost = await recalculateAverageCost(tx, item.id, Number(item.unitCost));
      const updatedItem = await tx.inventoryItem.update({
        where: { id: item.id },
        data: { currentStock: newStock, unitCost: averageCost },
      });
      await syncItemStockAlert(tx, shopId, item.id);
      const cancelledOriginal = await tx.stockTransaction.findUniqueOrThrow({
        where: { id: original.id },
        include: purchaseInclude,
      });
      return { purchase: replacement, reversal, original: cancelledOriginal, updatedItem, isDuplicate: false };
    });

    return {
      ...result,
      purchase: serializeTransaction(result.purchase),
      reversal: result.reversal ? serializeTransaction(result.reversal) : null,
      original: result.original ? serializeTransaction(result.original) : undefined,
      updatedItem: result.updatedItem ? withReplenishmentFields(result.updatedItem) : undefined,
      newStock: result.updatedItem
        ? Number(result.updatedItem.currentStock)
        : result.purchase.item
          ? Number(result.purchase.item.currentStock)
          : undefined,
    };
  }

  static async cancel(shopId: string, userId: string, id: string, reason: string, idempotencyKey: string) {
    getShopAndUser(shopId, userId);
    const reversalKey = `CANCEL:${idempotencyKey}:REVERSAL`;

    const result = await prisma.$transaction(async (tx) => {
      const retry = await tx.stockTransaction.findFirst({
        where: { shopId, idempotencyKey: reversalKey },
        include: purchaseInclude,
      });
      if (retry) {
        if (!retry.reversalOfId) throw new ConflictError('Cancellation audit record is incomplete.');
        const original = await tx.stockTransaction.findUniqueOrThrow({
          where: { id: retry.reversalOfId },
          include: purchaseInclude,
        });
        return { purchase: original, reversal: retry, isDuplicate: true };
      }

      const original = await loadOriginalPurchase(tx, shopId, id);
      await lockInventoryItem(tx, original.itemId, shopId);
      const auditGroupId = crypto.randomUUID();
      const claimed = await tx.stockTransaction.updateMany({
        where: { id, shopId, status: 'ACTIVE' },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: userId,
          cancellationReason: reason,
          auditGroupId,
        },
      });
      if (claimed.count === 0) throw new ConflictError('Purchase was already modified. Please refresh.');

      const item = await tx.inventoryItem.findFirst({ where: { id: original.itemId, shopId } });
      if (!item) throw new NotFoundError('Inventory item not found in your shop.');
      const currentStock = Number(item.currentStock);
      const newStock = roundQty(currentStock - Number(original.quantity));
      if (newStock < 0) {
        throw new BadRequestError('Cannot cancel this purchase because its stock has already been consumed.');
      }

      const reversal = await tx.stockTransaction.create({
        data: {
          shopId,
          itemId: item.id,
          type: 'REVERSAL',
          quantity: original.quantity,
          unitCost: original.unitCost,
          totalCost: original.totalCost,
          supplierId: original.supplierId,
          reference: `REVERSAL:${original.id}`,
          remarks: reason,
          idempotencyKey: reversalKey,
          reversalOfId: original.id,
          auditGroupId,
          createdById: userId,
          inputUnit: original.inputUnit || item.unit,
          inputQuantity: original.inputQuantity || original.quantity,
          inputUnitCost: original.inputUnitCost || original.unitCost,
        },
      });

      const averageCost = await recalculateAverageCost(tx, item.id, Number(item.unitCost));
      const updatedItem = await tx.inventoryItem.update({
        where: { id: item.id },
        data: { currentStock: newStock, unitCost: averageCost },
      });
      await syncItemStockAlert(tx, shopId, item.id);
      const cancelledOriginal = await tx.stockTransaction.findUniqueOrThrow({
        where: { id: original.id },
        include: purchaseInclude,
      });
      return { purchase: cancelledOriginal, reversal, updatedItem, isDuplicate: false };
    });

    return {
      ...result,
      purchase: serializeTransaction(result.purchase),
      reversal: result.reversal ? serializeTransaction(result.reversal) : null,
      updatedItem: result.updatedItem ? withReplenishmentFields(result.updatedItem) : undefined,
      newStock: result.updatedItem
        ? Number(result.updatedItem.currentStock)
        : result.purchase.item
          ? Number(result.purchase.item.currentStock)
          : undefined,
    };
  }
}
