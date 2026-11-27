import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { safeUserSelect } from '../utils/safeUser';
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../utils/errors';
import { parseDateInput } from '../utils/dateRange';
import { roundMoney } from '../utils/numbers';
import { lockInventoryItems, normalizeQuantity, validateTransactionCommon } from './stock.service';
import { syncItemStockAlert } from './stockAlert.service';
import type { ItemUnit } from '../utils/units';

export interface UsageCreateInput {
  items: Array<{ itemId: string; quantity: number; inputUnit?: ItemUnit }>;
  reference?: string | null;
  notes?: string | null;
  date?: string;
  idempotencyKey: string;
}

const usageInclude = {
  items: { include: { item: true } },
  movements: { include: { item: true, reversalOf: true } },
  createdByUser: { select: safeUserSelect },
  cancelledByUser: { select: safeUserSelect },
} satisfies Prisma.StockUsageInclude;

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
    item: movement.item ? { ...movement.item, currentStock: Number(movement.item.currentStock), unitCost: Number(movement.item.unitCost) } : null,
  };
}

function serializeUsage(usage: any): any {
  return {
    ...usage,
    totalCost: Number(usage.totalCost),
    items: usage.items?.map((item: any) => ({
      ...item,
      quantity: Number(item.quantity),
      unitCost: Number(item.unitCost),
      totalCost: Number(item.totalCost),
      item: item.item ? { ...item.item, currentStock: Number(item.item.currentStock), unitCost: Number(item.item.unitCost) } : null,
    })) || [],
    movements: usage.movements?.map(serializeMovement) || [],
  };
}

function usageDateFilter(startDate?: string, endDate?: string): Prisma.StockUsageWhereInput {
  if (!startDate && !endDate) return {};
  const from = startDate ? parseDateInput(startDate) : undefined;
  const to = endDate ? parseDateInput(endDate) : undefined;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) throw new ValidationError('Invalid usage date filter.');
  if (from) from.setHours(0, 0, 0, 0);
  if (to) to.setHours(23, 59, 59, 999);
  if (from && to && from > to) throw new ValidationError('startDate must be on or before endDate.');
  return { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } };
}

async function findByIdempotencyKey(shopId: string, idempotencyKey: string) {
  return prisma.stockUsage.findFirst({ where: { shopId, idempotencyKey }, include: usageInclude });
}

export class UsageService {
  static async create(shopId: string, userId: string, input: UsageCreateInput) {
    const tenant = context(shopId, userId);
    const existing = await findByIdempotencyKey(tenant.shopId, input.idempotencyKey);
    if (existing) return { usage: serializeUsage(existing), isDuplicate: true };

    try {
      const usage = await prisma.$transaction(async (tx) => {
        const retry = await tx.stockUsage.findFirst({ where: { shopId: tenant.shopId, idempotencyKey: input.idempotencyKey }, include: usageInclude });
        if (retry) return retry;
        const itemIds = input.items.map((line) => line.itemId).sort();
        await lockInventoryItems(tx, tenant.shopId, itemIds);
        const inventoryItems = await tx.inventoryItem.findMany({ where: { shopId: tenant.shopId, id: { in: itemIds } } });
        if (inventoryItems.length !== itemIds.length) throw new NotFoundError('One or more inventory items do not belong to your shop.');
        const byId = new Map(inventoryItems.map((item) => [item.id, item]));
        const lines = input.items.map((line) => {
          const item = byId.get(line.itemId)!;
          if (!item.isActive) throw new BadRequestError(`Inventory item "${item.name}" is archived.`);
          const quantity = normalizeQuantity(item, line.quantity, line.inputUnit);
          validateTransactionCommon(item, quantity, input.date);
          if (Number(item.currentStock) < quantity) {
            throw new BadRequestError(`Insufficient stock for "${item.name}": required ${quantity} ${item.unit}, available ${Number(item.currentStock)} ${item.unit}.`);
          }
          const unitCost = Number(item.unitCost);
          return { item, quantity, unitCost, totalCost: roundMoney(quantity * unitCost), inputUnit: line.inputUnit || item.unit, inputQuantity: line.quantity };
        });
        const totalCost = roundMoney(lines.reduce((sum, line) => sum + line.totalCost, 0));
        const created = await tx.stockUsage.create({
          data: {
            shopId: tenant.shopId,
            reference: input.reference || null,
            notes: input.notes || null,
            totalCost,
            idempotencyKey: input.idempotencyKey,
            createdById: tenant.userId,
            date: input.date ? parseDateInput(input.date) : new Date(),
            items: { create: lines.map((line) => ({
              item: { connect: { id: line.item.id } },
              name: line.item.name,
              unit: line.item.unit,
              quantity: line.quantity,
              unitCost: line.unitCost,
              totalCost: line.totalCost,
            })) },
          },
        });
        for (const line of lines) {
          await tx.inventoryItem.update({ where: { id: line.item.id }, data: { currentStock: { decrement: line.quantity } } });
        }
        await tx.stockTransaction.createMany({
          data: lines.map((line) => ({
            shopId: tenant.shopId,
            itemId: line.item.id,
            usageRecordId: created.id,
            type: 'USAGE' as const,
            quantity: line.quantity,
            unitCost: line.unitCost,
            totalCost: line.totalCost,
            reference: `USAGE:${created.id}`,
            remarks: input.notes || `Manual usage ${created.id}`,
            idempotencyKey: `USAGE:${created.id}:ITEM:${line.item.id}`,
            inputUnit: line.inputUnit,
            inputQuantity: line.inputQuantity,
            createdById: tenant.userId,
            date: created.date,
          })),
        });
        for (const line of lines) {
          await syncItemStockAlert(tx, tenant.shopId, line.item.id);
        }
        return tx.stockUsage.findUniqueOrThrow({ where: { id: created.id }, include: usageInclude });
      });
      return { usage: serializeUsage(usage), isDuplicate: false };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await findByIdempotencyKey(tenant.shopId, input.idempotencyKey);
        if (duplicate) return { usage: serializeUsage(duplicate), isDuplicate: true };
      }
      throw error;
    }
  }

  static async list(shopId: string, query: Record<string, any>) {
    const tenantId = context(shopId).shopId;
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);
    const where: Prisma.StockUsageWhereInput = {
      shopId: tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.itemId ? { items: { some: { itemId: query.itemId } } } : {}),
      ...usageDateFilter(query.startDate, query.endDate),
    };
    const [records, total, aggregate] = await Promise.all([
      prisma.stockUsage.findMany({ where, include: usageInclude, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * limit, take: limit }),
      prisma.stockUsage.count({ where }),
      prisma.stockUsage.aggregate({ where: { ...where, status: 'ACTIVE' }, _sum: { totalCost: true }, _count: true }),
    ]);
    return {
      usageRecords: records.map(serializeUsage),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      summary: { activeUsageCount: aggregate._count, totalCost: roundMoney(Number(aggregate._sum.totalCost || 0)) },
    };
  }

  static async getById(shopId: string, id: string) {
    const tenantId = context(shopId).shopId;
    const usage = await prisma.stockUsage.findFirst({ where: { id, shopId: tenantId }, include: usageInclude });
    if (!usage) throw new NotFoundError('Usage record not found in your shop.');
    return serializeUsage(usage);
  }

  static async cancel(shopId: string, userId: string, id: string, reason: string, idempotencyKey: string) {
    const tenant = context(shopId, userId);
    const auditGroupId = `USAGE-CANCEL:${idempotencyKey}`;
    const existing = await prisma.stockUsage.findFirst({ where: { shopId: tenant.shopId, auditGroupId }, include: usageInclude });
    if (existing) return cancellationResult(existing, true);

    try {
      const usage = await prisma.$transaction(async (tx) => {
        const retry = await tx.stockUsage.findFirst({ where: { shopId: tenant.shopId, auditGroupId }, include: usageInclude });
        if (retry) return retry;
        const original = await tx.stockUsage.findFirst({ where: { id, shopId: tenant.shopId }, include: usageInclude });
        if (!original) throw new NotFoundError('Usage record not found in your shop.');
        if (original.status !== 'ACTIVE') throw new ConflictError('Only active usage records can be cancelled.');
        const originalMovements = original.movements.filter((movement) => movement.type === 'USAGE' && movement.status === 'ACTIVE');
        await lockInventoryItems(tx, tenant.shopId, originalMovements.map((movement) => movement.itemId));
        const current = await tx.stockUsage.findUniqueOrThrow({ where: { id }, include: usageInclude });
        if (current.status !== 'ACTIVE') {
          if (current.auditGroupId === auditGroupId) return current;
          throw new ConflictError('Usage record was already modified. Please refresh.');
        }
        const claimed = await tx.stockUsage.updateMany({
          where: { id, shopId: tenant.shopId, status: 'ACTIVE' },
          data: { status: 'CANCELLED', auditGroupId, cancelledAt: new Date(), cancelledById: tenant.userId, cancellationReason: reason },
        });
        if (claimed.count === 0) throw new ConflictError('Usage record was already modified. Please refresh.');
        await tx.stockTransaction.updateMany({
          where: { usageRecordId: id, type: 'USAGE', status: 'ACTIVE' },
          data: { status: 'CANCELLED', auditGroupId, cancelledAt: new Date(), cancelledById: tenant.userId, cancellationReason: reason },
        });
        for (const movement of originalMovements) {
          await tx.stockTransaction.create({
            data: {
              shopId: tenant.shopId,
              itemId: movement.itemId,
              usageRecordId: id,
              type: 'REVERSAL',
              quantity: movement.quantity,
              unitCost: movement.unitCost,
              totalCost: movement.totalCost,
              reference: `REVERSAL:${movement.id}`,
              remarks: reason,
              idempotencyKey: `USAGE:${idempotencyKey}:REVERSAL:${movement.id}`,
              reversalOfId: movement.id,
              auditGroupId,
              inputUnit: movement.inputUnit || movement.item.unit,
              inputQuantity: movement.inputQuantity || movement.quantity,
              createdById: tenant.userId,
              date: movement.date,
            },
          });
          await tx.inventoryItem.update({ where: { id: movement.itemId }, data: { currentStock: { increment: movement.quantity } } });
        }
        for (const movement of originalMovements) {
          await syncItemStockAlert(tx, tenant.shopId, movement.itemId);
        }
        return tx.stockUsage.findUniqueOrThrow({ where: { id }, include: usageInclude });
      });
      return cancellationResult(usage, false);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await prisma.stockUsage.findFirst({ where: { shopId: tenant.shopId, auditGroupId }, include: usageInclude });
        if (duplicate) return cancellationResult(duplicate, true);
      }
      throw error;
    }
  }
}

function cancellationResult(usage: any, isDuplicate: boolean) {
  const serialized = serializeUsage(usage);
  return { usage: serialized, reversals: serialized.movements.filter((movement: any) => movement.type === 'REVERSAL'), isDuplicate };
}
