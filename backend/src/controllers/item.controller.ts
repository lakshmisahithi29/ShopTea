import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { BadRequestError, NotFoundError, UnauthorizedError, ConflictError, ValidationError } from '../utils/errors';
import { assertLevelOrder, withReplenishmentFields } from '../services/stockStatus';
import { roundMoney, roundQty, toNumber } from '../utils/numbers';
import { convertQuantityToBaseUnit, convertUnitCostToBaseUnit } from '../utils/units';
import { updateLevelsSchema } from '../validations/replenishment.validation';
import { syncItemStockAlert } from '../services/stockAlert.service';

function getShopId(req: Request): string {
  const shopId = req.user?.shopId;
  if (!shopId) {
    throw new UnauthorizedError('Shop profile required. Please complete shop setup.');
  }
  return shopId;
}

function duplicateItemError(): ConflictError {
  return new ConflictError('An inventory item with that name already exists in your shop.');
}

function normalizeOpeningStock(data: Record<string, any>) {
  const inputUnit = data.inputUnit || data.unit;
  try {
    const openingStock = roundQty(convertQuantityToBaseUnit(data.openingStock, inputUnit, data.unit));
    const unitCost = roundMoney(convertUnitCostToBaseUnit(data.unitCost, inputUnit, data.unit));
    if (openingStock > 999_999_999.999 || unitCost > 9_999_999_999.99) {
      throw new BadRequestError('Converted stock or cost exceeds the supported precision.');
    }
    if (data.openingStock > 0 && openingStock === 0) {
      throw new BadRequestError('Opening stock is too small for the selected inventory unit.');
    }
    if (data.unitCost > 0 && unitCost === 0) {
      throw new BadRequestError('Unit cost is too small for the selected inventory unit.');
    }
    return { openingStock, unitCost };
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError(`Cannot convert ${inputUnit} to ${data.unit}.`);
  }
}

function assertCountLevels(unit: string, minStock: number, reorderLevel: number, targetStock: number) {
  if ((unit === 'PIECES' || unit === 'PACKETS') && [minStock, reorderLevel, targetStock].some((value) => !Number.isInteger(value))) {
    throw new ValidationError(`Stock levels for ${unit.toLowerCase()} must be whole numbers.`);
  }
}

export async function getItems(req: Request, res: Response) {
  const shopId = getShopId(req);
  const filters = req.query as Record<string, any>;
  const where: Prisma.InventoryItemWhereInput = { shopId };

  if (filters.category) where.category = filters.category;
  if (filters.supplierId) where.supplierId = filters.supplierId;
  if (filters.activeOnly === 'true') where.isActive = true;
  if (filters.archivedOnly === 'true') where.isActive = false;
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const items = await prisma.inventoryItem.findMany({
    where,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: { supplier: true },
  });
  const serialized = items.map(withReplenishmentFields);
  const filtered = filters.status
    ? serialized.filter((item) => item.status === filters.status)
    : serialized;

  res.status(200).json({ success: true, items: filtered });
}

export async function getItemById(req: Request, res: Response) {
  const shopId = getShopId(req);
  const item = await prisma.inventoryItem.findFirst({
    where: { id: req.params.id, shopId },
    include: { supplier: true },
  });

  if (!item) {
    throw new NotFoundError('Inventory item not found in your shop.');
  }

  res.status(200).json({ success: true, item: withReplenishmentFields(item) });
}

export async function createItem(req: Request, res: Response) {
  const shopId = getShopId(req);
  const data = req.body;
  const normalized = normalizeOpeningStock(data);

  try {
    const item = await prisma.$transaction(async (tx) => {
      if (data.supplierId) {
        const supplier = await tx.supplier.findFirst({
          where: { id: data.supplierId, shopId },
        });
        if (!supplier) {
          throw new NotFoundError('Associated supplier not found in your shop.');
        }
      }

      const created = await tx.inventoryItem.create({
        data: {
          shopId,
          name: data.name,
          description: data.description || null,
          category: data.category,
          unit: data.unit,
          leadTimeDays: data.leadTimeDays,
          openingStock: normalized.openingStock,
          currentStock: normalized.openingStock,
          unitCost: normalized.unitCost,
          minStock: data.minStock,
          reorderLevel: data.reorderLevel,
          targetStock: data.targetStock,
          supplierId: data.supplierId || null,
          isActive: true,
        },
        include: { supplier: true },
      });

      if (normalized.openingStock > 0) {
        await tx.stockTransaction.create({
          data: {
            shopId,
            itemId: created.id,
            type: 'PURCHASE',
            quantity: normalized.openingStock,
            unitCost: normalized.unitCost,
            totalCost: roundMoney(data.openingStock * data.unitCost),
            supplierId: data.supplierId || null,
            reference: 'OPENING-STOCK',
            remarks: 'Initial stock balance on item creation',
            idempotencyKey: `OPENING-STOCK:${created.id}`,
            inputUnit: data.inputUnit || data.unit,
            inputQuantity: data.openingStock,
            inputUnitCost: data.unitCost,
            createdById: req.user?.id || null,
            date: new Date(),
          },
        });
      }

      await syncItemStockAlert(tx, shopId, created.id);
      return created;
    });

    res.status(201).json({
      success: true,
      message: 'Inventory item created successfully!',
      item: withReplenishmentFields(item),
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw duplicateItemError();
    }
    throw error;
  }
}

export async function updateItem(req: Request, res: Response) {
  const shopId = getShopId(req);
  const data = req.body;
  const item = await prisma.inventoryItem.findFirst({
    where: { id: req.params.id, shopId },
  });

  if (!item) {
    throw new NotFoundError('Inventory item not found in your shop.');
  }

  const nextMin = data.minStock !== undefined ? toNumber(data.minStock) : toNumber(item.minStock);
  const nextReorder =
    data.reorderLevel !== undefined ? toNumber(data.reorderLevel) : toNumber(item.reorderLevel);
  const nextTarget =
    data.targetStock !== undefined ? toNumber(data.targetStock) : toNumber(item.targetStock);
  assertLevelOrder(nextMin, nextReorder, nextTarget);
  assertCountLevels(item.unit, nextMin, nextReorder, nextTarget);

  if (data.supplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: data.supplierId, shopId },
    });
    if (!supplier) {
      throw new NotFoundError('Associated supplier not found in your shop.');
    }
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.inventoryItem.update({
        where: { id: item.id },
        data,
        include: { supplier: true },
      });
      await syncItemStockAlert(tx, shopId, item.id);
      return result;
    });

    res.status(200).json({
      success: true,
      message: data.isActive === false
        ? 'Inventory item archived. Stock history has been preserved.'
        : data.isActive === true
          ? 'Inventory item restored.'
          : 'Inventory item updated successfully!',
      item: withReplenishmentFields(updated),
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw duplicateItemError();
    }
    throw error;
  }
}

/** PATCH /api/items/:id/levels */
export async function updateStockLevels(req: Request, res: Response) {
  const shopId = getShopId(req);
  const { minStock, reorderLevel, targetStock } = updateLevelsSchema.parse(req.body);
  const item = await prisma.inventoryItem.findFirst({ where: { id: req.params.id, shopId } });

  if (!item) {
    throw new NotFoundError('Inventory item not found in your shop.');
  }

  assertLevelOrder(minStock, reorderLevel, targetStock);
  assertCountLevels(item.unit, minStock, reorderLevel, targetStock);

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.inventoryItem.update({
      where: { id: item.id },
      data: { minStock, reorderLevel, targetStock },
      include: { supplier: true },
    });
    await syncItemStockAlert(tx, shopId, item.id);
    return result;
  });

  res.status(200).json({
    success: true,
    message: 'Stock levels updated successfully!',
    item: withReplenishmentFields(updated),
  });
}
