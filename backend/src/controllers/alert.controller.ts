import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { NotFoundError, UnauthorizedError } from '../utils/errors';
import { serializeStockAlert, syncStockAlerts } from '../services/stockAlert.service';

const alertInclude = {
  item: { include: { supplier: true } },
} satisfies Prisma.StockAlertInclude;

function getShopId(req: Request): string {
  const shopId = req.user?.shopId;
  if (!shopId) throw new UnauthorizedError('Shop profile required. Please complete shop setup.');
  return shopId;
}

async function reconcile(shopId: string) {
  await prisma.$transaction((tx) => syncStockAlerts(tx, shopId));
}

/** GET /api/alerts */
export async function getAlerts(req: Request, res: Response) {
  const shopId = getShopId(req);
  const query = req.query as unknown as {
    status?: 'ACTIVE' | 'RESOLVED';
    type?: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'NEEDS_REORDER';
    itemId?: string;
    page: number;
    limit: number;
  };
  await reconcile(shopId);

  const where: Prisma.StockAlertWhereInput = {
    shopId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.itemId ? { itemId: query.itemId } : {}),
  };
  const [alerts, total] = await Promise.all([
    prisma.stockAlert.findMany({
      where,
      include: alertInclude,
      orderBy: [{ status: 'asc' }, { triggeredAt: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.stockAlert.count({ where }),
  ]);

  res.status(200).json({
    success: true,
    alerts: alerts.map(serializeStockAlert),
    pagination: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
  });
}

/** GET /api/alerts/summary */
export async function getAlertSummary(req: Request, res: Response) {
  const shopId = getShopId(req);
  await reconcile(shopId);
  const active = await prisma.stockAlert.findMany({
    where: { shopId, status: 'ACTIVE' },
    select: { type: true, readAt: true },
  });

  res.status(200).json({
    success: true,
    summary: {
      activeCount: active.length,
      unreadCount: active.filter((alert) => !alert.readAt).length,
      outOfStockCount: active.filter((alert) => alert.type === 'OUT_OF_STOCK').length,
      lowStockCount: active.filter((alert) => alert.type === 'LOW_STOCK').length,
      needsReorderCount: active.filter((alert) => alert.type === 'NEEDS_REORDER').length,
    },
  });
}

/** POST /api/alerts/:id/read */
export async function markAlertRead(req: Request, res: Response) {
  const shopId = getShopId(req);
  const result = await prisma.stockAlert.updateMany({
    where: { id: req.params.id, shopId },
    data: { readAt: new Date() },
  });
  if (result.count === 0) throw new NotFoundError('Stock alert not found in your shop.');
  const alert = await prisma.stockAlert.findFirstOrThrow({ where: { id: req.params.id, shopId }, include: alertInclude });
  res.status(200).json({ success: true, alert: serializeStockAlert(alert) });
}

/** POST /api/alerts/read-all */
export async function markAllAlertsRead(req: Request, res: Response) {
  const shopId = getShopId(req);
  const result = await prisma.stockAlert.updateMany({
    where: { shopId, status: 'ACTIVE', readAt: null },
    data: { readAt: new Date() },
  });
  res.status(200).json({ success: true, updatedCount: result.count });
}
