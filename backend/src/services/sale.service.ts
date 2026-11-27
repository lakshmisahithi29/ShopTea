import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { safeUserSelect } from '../utils/safeUser';
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../utils/errors';
import { parseDateInput } from '../utils/dateRange';
import { roundMoney, roundQty } from '../utils/numbers';
import { lockInventoryItems } from './stock.service';
import { syncItemStockAlert } from './stockAlert.service';

export interface SaleCreateInput {
  items: Array<{ menuItemId: string; quantity: number }>;
  reference?: string | null;
  notes?: string | null;
  date?: string;
  idempotencyKey: string;
}

const saleInclude = {
  items: { include: { menuItem: true } },
  movements: { include: { item: true, reversalOf: true } },
  createdByUser: { select: safeUserSelect },
  cancelledByUser: { select: safeUserSelect },
} satisfies Prisma.SaleInclude;

function context(shopId?: string, userId?: string) {
  if (!shopId) throw new UnauthorizedError('Shop profile required. Please complete shop setup.');
  return { shopId, userId };
}

function serializeMovement(movement: any): any {
  return {
    ...movement,
    quantity: Number(movement.quantity),
    unitCost: movement.unitCost === null ? null : Number(movement.unitCost),
    totalCost: movement.totalCost === null ? null : Number(movement.totalCost),
    inputQuantity: movement.inputQuantity === null ? null : Number(movement.inputQuantity),
    inputUnitCost: movement.inputUnitCost === null ? null : Number(movement.inputUnitCost),
    item: movement.item ? {
      ...movement.item,
      currentStock: Number(movement.item.currentStock),
      unitCost: Number(movement.item.unitCost),
    } : null,
  };
}

function serializeSale(sale: any): any {
  return {
    ...sale,
    total: Number(sale.total),
    items: sale.items?.map((item: any) => ({
      ...item,
      unitPrice: Number(item.unitPrice),
      total: Number(item.total),
      menuItem: item.menuItem ? { ...item.menuItem, sellingPrice: Number(item.menuItem.sellingPrice) } : null,
    })) || [],
    movements: sale.movements?.map(serializeMovement) || [],
  };
}

function saleDateFilter(startDate?: string, endDate?: string): Prisma.SaleWhereInput {
  if (!startDate && !endDate) return {};
  const from = startDate ? parseDateInput(startDate) : undefined;
  const to = endDate ? parseDateInput(endDate) : undefined;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) throw new ValidationError('Invalid sale date filter.');
  if (from) from.setHours(0, 0, 0, 0);
  if (to) to.setHours(23, 59, 59, 999);
  if (from && to && from > to) throw new ValidationError('startDate must be on or before endDate.');
  return { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } };
}

async function findByIdempotencyKey(shopId: string, idempotencyKey: string) {
  return prisma.sale.findFirst({ where: { shopId, idempotencyKey }, include: saleInclude });
}

export class SaleService {
  static async create(shopId: string, userId: string, input: SaleCreateInput) {
    const tenant = context(shopId, userId);
    const existing = await findByIdempotencyKey(tenant.shopId, input.idempotencyKey);
    if (existing) return { sale: serializeSale(existing), isDuplicate: true };

    try {
      const sale = await prisma.$transaction(async (tx) => {
        const retry = await tx.sale.findFirst({ where: { shopId: tenant.shopId, idempotencyKey: input.idempotencyKey }, include: saleInclude });
        if (retry) return retry;

        const menuIds = input.items.map((item) => item.menuItemId);
        const menuItems = await tx.menuItem.findMany({
          where: { shopId: tenant.shopId, id: { in: menuIds }, isActive: true },
          include: { recipeItems: { include: { item: true } } },
        });
        if (menuItems.length !== menuIds.length) {
          throw new BadRequestError('One or more menu items are unavailable or do not belong to your shop.');
        }
        const menuById = new Map(menuItems.map((menu) => [menu.id, menu]));
        const saleItems = input.items.map((line) => {
          const menu = menuById.get(line.menuItemId)!;
          const unitPrice = Number(menu.sellingPrice);
          return { menuItemId: menu.id, name: menu.name, quantity: line.quantity, unitPrice, total: roundMoney(unitPrice * line.quantity) };
        });
        const total = roundMoney(saleItems.reduce((sum, item) => sum + item.total, 0));

        const ingredients = new Map<string, number>();
        for (const line of input.items) {
          const menu = menuById.get(line.menuItemId)!;
          for (const recipe of menu.recipeItems) {
            const quantity = roundQty(Number(recipe.quantity) * line.quantity);
            if (quantity <= 0) throw new BadRequestError(`Recipe quantity for "${recipe.item.name}" is too small.`);
            ingredients.set(recipe.itemId, roundQty((ingredients.get(recipe.itemId) || 0) + quantity));
          }
        }

        const itemIds = [...ingredients.keys()].sort();
        await lockInventoryItems(tx, tenant.shopId, itemIds);
        const inventoryItems = await tx.inventoryItem.findMany({ where: { shopId: tenant.shopId, id: { in: itemIds } } });
        if (inventoryItems.length !== itemIds.length) throw new NotFoundError('One or more recipe ingredients no longer exist.');
        for (const item of inventoryItems) {
          if (!item.isActive) throw new BadRequestError(`Recipe ingredient "${item.name}" is archived.`);
          const required = ingredients.get(item.id)!;
          if (Number(item.currentStock) < required) {
            throw new BadRequestError(`Insufficient stock for "${item.name}": required ${required} ${item.unit}, available ${Number(item.currentStock)} ${item.unit}.`);
          }
        }

        const created = await tx.sale.create({
          data: {
            shopId: tenant.shopId,
            reference: input.reference || null,
            notes: input.notes || null,
            total,
            status: 'ACTIVE',
            idempotencyKey: input.idempotencyKey,
            createdById: tenant.userId,
            date: input.date ? parseDateInput(input.date) : new Date(),
            items: { create: saleItems.map(({ menuItemId, ...item }) => ({ ...item, menuItem: { connect: { id: menuItemId } } })) },
          },
        });

        for (const item of inventoryItems) {
          const quantity = ingredients.get(item.id)!;
          await tx.inventoryItem.update({ where: { id: item.id }, data: { currentStock: { decrement: quantity } } });
        }
        await tx.stockTransaction.createMany({
          data: inventoryItems.map((item) => {
            const quantity = ingredients.get(item.id)!;
            const unitCost = Number(item.unitCost);
            return {
              shopId: tenant.shopId,
              itemId: item.id,
              saleId: created.id,
              type: 'USAGE' as const,
              quantity,
              unitCost,
              totalCost: roundMoney(quantity * unitCost),
              reference: `SALE:${created.id}`,
              remarks: `Recipe usage for sale ${created.id}`,
              idempotencyKey: `SALE:${created.id}:ITEM:${item.id}`,
              inputUnit: item.unit,
              inputQuantity: quantity,
              createdById: tenant.userId,
              date: created.date,
            };
          }),
        });
        for (const itemId of itemIds) {
          await syncItemStockAlert(tx, tenant.shopId, itemId);
        }
        return tx.sale.findUniqueOrThrow({ where: { id: created.id }, include: saleInclude });
      });
      return { sale: serializeSale(sale), isDuplicate: false };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await findByIdempotencyKey(tenant.shopId, input.idempotencyKey);
        if (duplicate) return { sale: serializeSale(duplicate), isDuplicate: true };
      }
      throw error;
    }
  }

  static async list(shopId: string, query: Record<string, any>) {
    const tenantId = context(shopId).shopId;
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);
    const where: Prisma.SaleWhereInput = {
      shopId: tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.menuItemId ? { items: { some: { menuItemId: query.menuItemId } } } : {}),
      ...saleDateFilter(query.startDate, query.endDate),
    };
    const activeWhere = { ...where, status: 'ACTIVE' as const };
    const [sales, total, aggregate, itemAggregate] = await Promise.all([
      prisma.sale.findMany({ where, include: saleInclude, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * limit, take: limit }),
      prisma.sale.count({ where }),
      prisma.sale.aggregate({ where: activeWhere, _sum: { total: true }, _count: true }),
      prisma.saleItem.aggregate({ where: { sale: activeWhere }, _sum: { quantity: true } }),
    ]);
    return {
      sales: sales.map(serializeSale),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      summary: {
        activeSaleCount: aggregate._count,
        revenue: roundMoney(Number(aggregate._sum.total || 0)),
        itemsSold: itemAggregate._sum.quantity || 0,
      },
    };
  }

  static async getById(shopId: string, id: string) {
    const tenantId = context(shopId).shopId;
    const sale = await prisma.sale.findFirst({ where: { id, shopId: tenantId }, include: saleInclude });
    if (!sale) throw new NotFoundError('Sale not found in your shop.');
    return serializeSale(sale);
  }

  static async cancel(shopId: string, userId: string, id: string, reason: string, idempotencyKey: string) {
    const tenant = context(shopId, userId);
    const auditGroupId = `SALE-CANCEL:${idempotencyKey}`;
    const existing = await prisma.sale.findFirst({ where: { shopId: tenant.shopId, auditGroupId }, include: saleInclude });
    if (existing) return cancellationResult(existing, true);

    try {
      const sale = await prisma.$transaction(async (tx) => {
        const retry = await tx.sale.findFirst({ where: { shopId: tenant.shopId, auditGroupId }, include: saleInclude });
        if (retry) return retry;
        const original = await tx.sale.findFirst({ where: { id, shopId: tenant.shopId }, include: saleInclude });
        if (!original) throw new NotFoundError('Sale not found in your shop.');
        if (original.status !== 'ACTIVE') throw new ConflictError('Only active sales can be cancelled.');

        const originalMovements = original.movements.filter((movement) => movement.type === 'USAGE' && movement.status === 'ACTIVE');
        await lockInventoryItems(tx, tenant.shopId, originalMovements.map((movement) => movement.itemId));
        const current = await tx.sale.findUniqueOrThrow({ where: { id }, include: saleInclude });
        if (current.status !== 'ACTIVE') {
          if (current.auditGroupId === auditGroupId) return current;
          throw new ConflictError('Sale was already modified. Please refresh.');
        }

        const claimed = await tx.sale.updateMany({
          where: { id, shopId: tenant.shopId, status: 'ACTIVE' },
          data: { status: 'CANCELLED', auditGroupId, cancelledAt: new Date(), cancelledById: tenant.userId, cancellationReason: reason },
        });
        if (claimed.count === 0) throw new ConflictError('Sale was already modified. Please refresh.');
        await tx.stockTransaction.updateMany({
          where: { saleId: id, type: 'USAGE', status: 'ACTIVE' },
          data: { status: 'CANCELLED', auditGroupId, cancelledAt: new Date(), cancelledById: tenant.userId, cancellationReason: reason },
        });

        for (const movement of originalMovements) {
          await tx.stockTransaction.create({
            data: {
              shopId: tenant.shopId,
              itemId: movement.itemId,
              saleId: id,
              type: 'REVERSAL',
              quantity: movement.quantity,
              unitCost: movement.unitCost,
              totalCost: movement.totalCost,
              reference: `REVERSAL:${movement.id}`,
              remarks: reason,
              idempotencyKey: `SALE:${idempotencyKey}:REVERSAL:${movement.id}`,
              reversalOfId: movement.id,
              auditGroupId,
              inputUnit: movement.inputUnit || movement.item.unit,
              inputQuantity: movement.inputQuantity ?? movement.quantity,
              inputUnitCost: movement.inputUnitCost ?? movement.unitCost,
              createdById: tenant.userId,
              date: movement.date,
            },
          });
          await tx.inventoryItem.update({ where: { id: movement.itemId }, data: { currentStock: { increment: movement.quantity } } });
        }
        for (const movement of originalMovements) {
          await syncItemStockAlert(tx, tenant.shopId, movement.itemId);
        }
        return tx.sale.findUniqueOrThrow({ where: { id }, include: saleInclude });
      });
      return cancellationResult(sale, false);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await prisma.sale.findFirst({ where: { shopId: tenant.shopId, auditGroupId }, include: saleInclude });
        if (duplicate) return cancellationResult(duplicate, true);
      }
      throw error;
    }
  }
}

function cancellationResult(sale: any, isDuplicate: boolean) {
  const serialized = serializeSale(sale);
  return { sale: serialized, reversals: serialized.movements.filter((movement: any) => movement.type === 'REVERSAL'), isDuplicate };
}
