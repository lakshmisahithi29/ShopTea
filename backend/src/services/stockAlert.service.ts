import { Prisma, type StockAlertType } from '@prisma/client';
import { toNumber } from '../utils/numbers';
import { withReplenishmentFields } from './stockStatus';

const ACTIVE_KEY = 'ACTIVE';

const ALERT_COPY: Record<StockAlertType, { title: string; message: (name: string) => string }> = {
  OUT_OF_STOCK: {
    title: 'Out of stock',
    message: (name) => `${name} is out of stock. Record a purchase or stock adjustment.`,
  },
  LOW_STOCK: {
    title: 'Low stock',
    message: (name) => `${name} is at or below its minimum stock level.`,
  },
  NEEDS_REORDER: {
    title: 'Reorder reminder',
    message: (name) => `${name} has reached its reorder level.`,
  },
};

function snapshot(item: ReturnType<typeof withReplenishmentFields>) {
  return {
    currentStock: item.currentStock,
    minStock: item.minStock,
    reorderLevel: item.reorderLevel,
    targetStock: item.targetStock,
    suggestedQty: item.suggestedQty,
  };
}

export async function syncItemStockAlert(
  tx: Prisma.TransactionClient,
  shopId: string,
  itemId: string
) {
  const item = await tx.inventoryItem.findFirst({ where: { id: itemId, shopId } });
  if (!item) return;

  const enriched = withReplenishmentFields(item);
  const desiredType: StockAlertType | null =
    !item.isActive || enriched.status === 'HEALTHY' ? null : enriched.status;
  const activeAlerts = await tx.stockAlert.findMany({
    where: { shopId, itemId, status: 'ACTIVE' },
  });
  const now = new Date();
  const values = snapshot(enriched);

  for (const alert of activeAlerts) {
    if (alert.type === desiredType) continue;
    const reason = !item.isActive
      ? 'Item archived; active stock monitoring stopped.'
      : desiredType
        ? `Stock condition changed to ${ALERT_COPY[desiredType].title.toLowerCase()}.`
        : 'Stock replenished above configured thresholds.';
    await tx.stockAlert.update({
      where: { id: alert.id },
      data: {
        ...values,
        status: 'RESOLVED',
        activeKey: null,
        resolvedAt: now,
        resolutionReason: reason,
      },
    });
  }

  if (!desiredType) return;

  const copy = ALERT_COPY[desiredType];
  await tx.stockAlert.updateMany({
    where: { shopId, itemId, type: desiredType, status: 'ACTIVE' },
    data: {
      ...values,
      title: copy.title,
      message: copy.message(item.name),
    },
  });
  await tx.stockAlert.createMany({
    data: [
      {
        shopId,
        itemId,
        type: desiredType,
        status: 'ACTIVE',
        activeKey: ACTIVE_KEY,
        title: copy.title,
        message: copy.message(item.name),
        ...values,
        triggeredAt: now,
      },
    ],
    skipDuplicates: true,
  });
}

export async function syncStockAlerts(tx: Prisma.TransactionClient, shopId: string) {
  const items = await tx.inventoryItem.findMany({
    where: { shopId },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  for (const item of items) {
    await syncItemStockAlert(tx, shopId, item.id);
  }
}

export function serializeStockAlert(alert: any) {
  return {
    ...alert,
    currentStock: toNumber(alert.currentStock),
    minStock: toNumber(alert.minStock),
    reorderLevel: toNumber(alert.reorderLevel),
    targetStock: toNumber(alert.targetStock),
    suggestedQty: toNumber(alert.suggestedQty),
    item: alert.item
      ? {
          ...alert.item,
          currentStock: toNumber(alert.item.currentStock),
          unitCost: toNumber(alert.item.unitCost),
          supplier: alert.item.supplier
            ? { id: alert.item.supplier.id, name: alert.item.supplier.name, phone: alert.item.supplier.phone }
            : null,
        }
      : null,
  };
}
