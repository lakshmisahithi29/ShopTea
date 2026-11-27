import { roundMoney, roundQty, toNumber } from '../utils/numbers';
import { ValidationError } from '../utils/errors';

export type StockStatus = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'NEEDS_REORDER' | 'HEALTHY';

export function computeStockStatus(
  currentStock: unknown,
  minStock: unknown,
  reorderLevel: unknown
): StockStatus {
  const current = toNumber(currentStock);
  const min = toNumber(minStock);
  const reorder = toNumber(reorderLevel);

  if (current === 0) return 'OUT_OF_STOCK';
  if (current > 0 && current <= min) return 'LOW_STOCK';
  if (current <= reorder) return 'NEEDS_REORDER';
  return 'HEALTHY';
}

export function suggestedReorderQty(currentStock: unknown, targetStock: unknown): number {
  const suggested = toNumber(targetStock) - toNumber(currentStock);
  return roundQty(Math.max(0, suggested));
}

export function estimatedReorderCost(
  suggestedQty: number,
  unitCost: unknown
): number {
  return roundMoney(suggestedQty * toNumber(unitCost));
}

export function assertLevelOrder(minStock: number, reorderLevel: number, targetStock: number) {
  if (minStock < 0 || reorderLevel < 0 || targetStock < 0) {
    throw new ValidationError('Stock levels cannot be negative.');
  }
  if (minStock > reorderLevel) {
    throw new ValidationError('Minimum stock must be ≤ reorder level.');
  }
  if (reorderLevel > targetStock) {
    throw new ValidationError('Reorder level must be ≤ target stock.');
  }
}

export function withReplenishmentFields<T extends Record<string, any>>(item: T) {
  const currentStock = toNumber(item.currentStock);
  const minStock = toNumber(item.minStock);
  const reorderLevel = toNumber(item.reorderLevel);
  const targetStock = toNumber(item.targetStock);
  const unitCost = toNumber(item.unitCost);
  const openingStock = toNumber(item.openingStock);
  const status = computeStockStatus(currentStock, minStock, reorderLevel);
  const suggestedQty = suggestedReorderQty(currentStock, targetStock);

  return {
    ...item,
    currentStock,
    minStock,
    reorderLevel,
    targetStock,
    unitCost,
    openingStock,
    status,
    suggestedQty,
    estimatedCost: estimatedReorderCost(suggestedQty, unitCost),
  };
}
