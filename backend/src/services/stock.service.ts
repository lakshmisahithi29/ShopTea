import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { safeUserSelect } from '../utils/safeUser';
import { isFutureTransactionDate, parseDateInput } from '../utils/dateRange';
import { roundMoney, roundQty } from '../utils/numbers';
import { convertQuantityToBaseUnit, convertUnitCostToBaseUnit, type ItemUnit } from '../utils/units';
import { syncItemStockAlert } from './stockAlert.service';

export interface PurchaseDto {
  itemId: string;
  quantity: number;
  unitCost: number;
  supplierId?: string | null;
  reference?: string | null;
  remarks?: string | null;
  date?: string;
  idempotencyKey?: string;
  inputUnit?: ItemUnit;
}

export interface UsageDto {
  itemId: string;
  quantity: number;
  remarks?: string | null;
  date?: string;
  idempotencyKey?: string;
  inputUnit?: ItemUnit;
}

export interface WastageDto {
  itemId: string;
  quantity: number;
  wastageReason: 'EXPIRED' | 'SPOILED' | 'DAMAGED' | 'SPILLED' | 'OTHER';
  remarks?: string | null;
  date?: string;
  idempotencyKey?: string;
  inputUnit?: ItemUnit;
}

export interface AdjustmentDto {
  itemId: string;
  quantity: number;
  adjustmentType: 'INCREASE' | 'DECREASE';
  remarks: string;
  date?: string;
  idempotencyKey?: string;
  inputUnit?: ItemUnit;
}

export function normalizeQuantity(item: any, quantity: number, inputUnit: ItemUnit = item.unit): number {
  validateTransactionCommon(item, quantity);
  try {
    const normalized = roundQty(convertQuantityToBaseUnit(quantity, inputUnit, item.unit));
    if (normalized > 999_999_999.999) {
      throw new BadRequestError('Converted quantity exceeds the supported precision.');
    }
    if (normalized === 0) {
      throw new BadRequestError('Quantity is too small for the selected inventory unit.');
    }
    return normalized;
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError(`Cannot convert ${inputUnit} to ${item.unit}.`);
  }
}

export function normalizePurchaseCost(item: any, unitCost: number, inputUnit: ItemUnit = item.unit): number {
  try {
    const normalized = roundMoney(convertUnitCostToBaseUnit(unitCost, inputUnit, item.unit));
    if (normalized > 9_999_999_999.99) {
      throw new BadRequestError('Converted unit cost exceeds the supported precision.');
    }
    if (normalized === 0) {
      throw new BadRequestError('Unit cost is too small for the selected inventory unit.');
    }
    return normalized;
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError(`Cannot convert ${inputUnit} to ${item.unit}.`);
  }
}

export function validateTransactionCommon(
  item: any,
  quantity: number,
  date?: string
) {
  if (quantity <= 0) {
    throw new BadRequestError('Quantity must be greater than zero.');
  }

  // Whole number rule for pieces and packets
  if (item.unit === 'PIECES' || item.unit === 'PACKETS') {
    if (quantity % 1 !== 0) {
      throw new BadRequestError(
        `Quantity for ${item.unit.toLowerCase()} must be a whole number.`
      );
    }
  }

  if (date) {
    if (Number.isNaN(parseDateInput(date).getTime())) {
      throw new BadRequestError('Invalid transaction date.');
    }
    if (isFutureTransactionDate(date)) {
      throw new BadRequestError('Transaction date cannot be in the future.');
    }
  }
}

export async function lockInventoryItem(tx: any, itemId: string, shopId: string) {
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM inventory_items
    WHERE id = ${itemId} AND "shopId" = ${shopId}
    FOR UPDATE
  `);
}

export async function lockInventoryItems(tx: any, shopId: string, itemIds: string[]) {
  const ids = [...new Set(itemIds)].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM inventory_items
    WHERE "shopId" = ${shopId} AND id IN (${Prisma.join(ids)})
    FOR UPDATE
  `);
}

export class StockService {
  /**
   * Record purchase: increases current stock, records supplier/cost, updates item unit cost
   */
  static async recordPurchase(
    shopId: string,
    userId: string,
    dto: PurchaseDto
  ) {
    // 1. Idempotency Check
    if (dto.idempotencyKey) {
      const existing = await prisma.stockTransaction.findFirst({
        where: { shopId, idempotencyKey: dto.idempotencyKey },
        include: { item: true, supplier: true, createdByUser: { select: safeUserSelect } },
      });
      if (existing) {
        return { transaction: existing, isDuplicate: true };
      }
    }

    try {
      return await prisma.$transaction(async (tx: any) => {
        await lockInventoryItem(tx, dto.itemId, shopId);
        // 2. Fetch & Validate Item
        const item = await tx.inventoryItem.findFirst({
          where: { id: dto.itemId, shopId },
        });

        if (!item) {
          throw new NotFoundError('Inventory item not found in your shop.');
        }

        if (!item.isActive) {
          throw new BadRequestError(
            `Cannot record transactions for archived item "${item.name}". Please activate the item first.`
          );
        }

        const quantity = normalizeQuantity(item, dto.quantity, dto.inputUnit);
        const unitCost = normalizePurchaseCost(item, dto.unitCost, dto.inputUnit);
        validateTransactionCommon(item, quantity, dto.date);

        // Validate Supplier belongs to Shop if provided
        if (dto.supplierId) {
          const sup = await tx.supplier.findFirst({
            where: { id: dto.supplierId, shopId },
          });
          if (!sup) {
            throw new NotFoundError('Supplier not found in your shop.');
          }
        }

        // 3. Calculate New Stock & Costs
        const currentStockNum = Number(item.currentStock);
        const newStock = roundQty(currentStockNum + quantity);
        const totalCost = roundMoney(dto.quantity * dto.unitCost);

        // Weighted-average costing keeps valuation stable across purchase prices.
        const weightedCost = currentStockNum + quantity > 0
          ? roundMoney((currentStockNum * Number(item.unitCost) + quantity * unitCost) / (currentStockNum + quantity))
          : unitCost;

        // 4. Update Item (Current Stock and weighted-average unit cost)
        const updatedItem = await tx.inventoryItem.update({
          where: { id: item.id },
          data: {
            currentStock: newStock,
            unitCost: weightedCost,
          },
        });

        // 5. Create Immutable Transaction Record
        const transaction = await tx.stockTransaction.create({
          data: {
            shopId,
            itemId: item.id,
            type: 'PURCHASE',
            quantity,
            unitCost,
            totalCost,
            supplierId: dto.supplierId || null,
            reference: dto.reference || null,
            remarks: dto.remarks || null,
            idempotencyKey: dto.idempotencyKey || null,
            inputUnit: dto.inputUnit || item.unit,
            inputQuantity: dto.quantity,
            inputUnitCost: dto.unitCost,
            createdById: userId,
            date: dto.date ? parseDateInput(dto.date) : new Date(),
          },
          include: { item: true, supplier: true, createdByUser: { select: safeUserSelect } },
        });
        await syncItemStockAlert(tx, shopId, item.id);

        return { transaction, previousStock: currentStockNum, newStock, updatedItem, isDuplicate: false };
      });
    } catch (error) {
      if (
        dto.idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await prisma.stockTransaction.findFirst({
          where: { shopId, idempotencyKey: dto.idempotencyKey },
          include: { item: true, supplier: true, createdByUser: { select: safeUserSelect } },
        });
        if (existing) return { transaction: existing, isDuplicate: true };
      }
      throw error;
    }
  }

  /**
   * Record usage: decreases current stock, blocks negative stock
   */
  static async recordUsage(
    shopId: string,
    userId: string,
    dto: UsageDto
  ) {
    if (dto.idempotencyKey) {
      const existing = await prisma.stockTransaction.findFirst({
        where: { shopId, idempotencyKey: dto.idempotencyKey },
        include: { item: true, supplier: true, createdByUser: { select: safeUserSelect } },
      });
      if (existing) {
        return { transaction: existing, isDuplicate: true };
      }
    }

    return await prisma.$transaction(async (tx: any) => {
      await lockInventoryItem(tx, dto.itemId, shopId);
      const item = await tx.inventoryItem.findFirst({
        where: { id: dto.itemId, shopId },
      });

      if (!item) {
        throw new NotFoundError('Inventory item not found in your shop.');
      }

      if (!item.isActive) {
        throw new BadRequestError(
          `Cannot record transactions for archived item "${item.name}".`
        );
      }

      const quantity = normalizeQuantity(item, dto.quantity, dto.inputUnit);
      validateTransactionCommon(item, quantity, dto.date);

      const currentStockNum = Number(item.currentStock);

      // Enforce zero/positive stock limit
      if (currentStockNum < quantity) {
        throw new BadRequestError(
          `Insufficient stock: Cannot record usage of ${quantity} ${item.unit}. Available stock is only ${currentStockNum} ${item.unit}.`
        );
      }

      const newStock = roundQty(currentStockNum - quantity);
      const totalCost = roundMoney(quantity * Number(item.unitCost));

      const updatedItem = await tx.inventoryItem.update({
        where: { id: item.id },
        data: {
          currentStock: newStock,
        },
      });

      const transaction = await tx.stockTransaction.create({
        data: {
          shopId,
          itemId: item.id,
          type: 'USAGE',
          quantity,
          unitCost: item.unitCost,
          totalCost,
          remarks: dto.remarks || null,
          idempotencyKey: dto.idempotencyKey || null,
          inputUnit: dto.inputUnit || item.unit,
          inputQuantity: dto.quantity,
          createdById: userId,
          date: dto.date ? parseDateInput(dto.date) : new Date(),
        },
        include: { item: true, createdByUser: { select: safeUserSelect } },
      });
      await syncItemStockAlert(tx, shopId, item.id);

      return { transaction, previousStock: currentStockNum, newStock, updatedItem, isDuplicate: false };
    });
  }

  /**
   * Record wastage: decreases current stock, records reason dropdown
   */
  static async recordWastage(
    shopId: string,
    userId: string,
    dto: WastageDto
  ) {
    if (dto.idempotencyKey) {
      const existing = await prisma.stockTransaction.findFirst({
        where: { shopId, idempotencyKey: dto.idempotencyKey },
        include: { item: true, supplier: true, createdByUser: { select: safeUserSelect } },
      });
      if (existing) {
        return { transaction: existing, isDuplicate: true };
      }
    }

    return await prisma.$transaction(async (tx: any) => {
      await lockInventoryItem(tx, dto.itemId, shopId);
      const item = await tx.inventoryItem.findFirst({
        where: { id: dto.itemId, shopId },
      });

      if (!item) {
        throw new NotFoundError('Inventory item not found in your shop.');
      }

      if (!item.isActive) {
        throw new BadRequestError(
          `Cannot record wastage for archived item "${item.name}".`
        );
      }

      const quantity = normalizeQuantity(item, dto.quantity, dto.inputUnit);
      validateTransactionCommon(item, quantity, dto.date);

      const currentStockNum = Number(item.currentStock);

      if (currentStockNum < quantity) {
        throw new BadRequestError(
          `Insufficient stock: Cannot record wastage of ${quantity} ${item.unit}. Available stock is only ${currentStockNum} ${item.unit}.`
        );
      }

      const newStock = roundQty(currentStockNum - quantity);
      const totalCost = roundMoney(quantity * Number(item.unitCost));

      const updatedItem = await tx.inventoryItem.update({
        where: { id: item.id },
        data: {
          currentStock: newStock,
        },
      });

      const transaction = await tx.stockTransaction.create({
        data: {
          shopId,
          itemId: item.id,
          type: 'WASTAGE',
          quantity,
          unitCost: item.unitCost,
          totalCost,
          wastageReason: dto.wastageReason,
          remarks: dto.remarks || null,
          idempotencyKey: dto.idempotencyKey || null,
          inputUnit: dto.inputUnit || item.unit,
          inputQuantity: dto.quantity,
          createdById: userId,
          date: dto.date ? parseDateInput(dto.date) : new Date(),
        },
        include: { item: true, createdByUser: { select: safeUserSelect } },
      });
      await syncItemStockAlert(tx, shopId, item.id);

      return { transaction, previousStock: currentStockNum, newStock, updatedItem, isDuplicate: false };
    });
  }

  /**
   * Record adjustment: counting corrections (increase or decrease, remarks required)
   */
  static async recordAdjustment(
    shopId: string,
    userId: string,
    dto: AdjustmentDto
  ) {
    if (dto.idempotencyKey) {
      const existing = await prisma.stockTransaction.findFirst({
        where: { shopId, idempotencyKey: dto.idempotencyKey },
        include: { item: true, supplier: true, createdByUser: { select: safeUserSelect } },
      });
      if (existing) {
        return { transaction: existing, isDuplicate: true };
      }
    }

    return await prisma.$transaction(async (tx: any) => {
      await lockInventoryItem(tx, dto.itemId, shopId);
      const item = await tx.inventoryItem.findFirst({
        where: { id: dto.itemId, shopId },
      });

      if (!item) {
        throw new NotFoundError('Inventory item not found in your shop.');
      }

      if (!item.isActive) {
        throw new BadRequestError(
          `Cannot adjust stock for archived item "${item.name}".`
        );
      }

      const quantity = normalizeQuantity(item, dto.quantity, dto.inputUnit);
      validateTransactionCommon(item, quantity, dto.date);

      const currentStockNum = Number(item.currentStock);
      let newStock = currentStockNum;

      if (dto.adjustmentType === 'INCREASE') {
        newStock = roundQty(currentStockNum + quantity);
      } else {
        if (currentStockNum < quantity) {
          throw new BadRequestError(
            `Adjustment decrease of ${quantity} ${item.unit} exceeds current stock of ${currentStockNum} ${item.unit}.`
          );
        }
        newStock = roundQty(currentStockNum - quantity);
      }

      const updatedItem = await tx.inventoryItem.update({
        where: { id: item.id },
        data: {
          currentStock: newStock,
        },
      });

      const transaction = await tx.stockTransaction.create({
        data: {
          shopId,
          itemId: item.id,
          type: 'ADJUSTMENT',
          quantity,
          remarks: `[${dto.adjustmentType}] ${dto.remarks}`,
          idempotencyKey: dto.idempotencyKey || null,
          inputUnit: dto.inputUnit || item.unit,
          inputQuantity: dto.quantity,
          createdById: userId,
          date: dto.date ? parseDateInput(dto.date) : new Date(),
        },
        include: { item: true, createdByUser: { select: safeUserSelect } },
      });
      await syncItemStockAlert(tx, shopId, item.id);

      return { transaction, previousStock: currentStockNum, newStock, updatedItem, isDuplicate: false };
    });
  }
}
