import { Request, Response } from 'express';
import { StockService } from '../services/stock.service';
import { PurchaseService } from '../services/purchase.service';
import { prisma } from '../utils/prisma';
import { NotFoundError, UnauthorizedError } from '../utils/errors';
import { safeUserSelect } from '../utils/safeUser';
import {
  purchaseTransactionSchema,
  usageTransactionSchema,
  wastageTransactionSchema,
  adjustmentTransactionSchema,
  transactionFilterSchema,
} from '../validations/transaction.validation';

function getShopAndUserId(req: Request) {
  const shopId = req.user?.shopId;
  const userId = req.user?.id;
  if (!shopId || !userId) {
    throw new UnauthorizedError('Shop profile required. Please complete shop setup.');
  }
  return { shopId, userId };
}

export async function createPurchase(req: Request, res: Response) {
  const { shopId, userId } = getShopAndUserId(req);
  const dto = req.body;
  const result = await PurchaseService.create(shopId, userId, dto);

  res.status(result.isDuplicate ? 200 : 201).json({
    success: true,
    message: result.isDuplicate
      ? 'Purchase already recorded (duplicate idempotency key).'
      : 'Purchase recorded successfully! Current stock updated.',
    ...result,
  });
}

export async function createUsage(req: Request, res: Response) {
  const { shopId, userId } = getShopAndUserId(req);
  const dto = req.body;
  const result = await StockService.recordUsage(shopId, userId, dto);

  res.status(result.isDuplicate ? 200 : 201).json({
    success: true,
    message: result.isDuplicate
      ? 'Usage already recorded (duplicate idempotency key).'
      : 'Usage recorded successfully! Stock deducted.',
    ...result,
  });
}

export async function createWastage(req: Request, res: Response) {
  const { shopId, userId } = getShopAndUserId(req);
  const dto = req.body;
  const result = await StockService.recordWastage(shopId, userId, dto);

  res.status(result.isDuplicate ? 200 : 201).json({
    success: true,
    message: result.isDuplicate
      ? 'Wastage already recorded (duplicate idempotency key).'
      : 'Wastage logged successfully! Stock deducted.',
    ...result,
  });
}

export async function createAdjustment(req: Request, res: Response) {
  const { shopId, userId } = getShopAndUserId(req);
  const dto = req.body;
  const result = await StockService.recordAdjustment(shopId, userId, dto);

  res.status(result.isDuplicate ? 200 : 201).json({
    success: true,
    message: result.isDuplicate
      ? 'Adjustment already recorded (duplicate idempotency key).'
      : 'Stock adjustment recorded successfully!',
    ...result,
  });
}

export async function getTransactions(req: Request, res: Response) {
  const { shopId } = getShopAndUserId(req);
  const filters = req.query as any;

  const page = Math.max(1, parseInt(filters.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit || '15', 10)));
  const skip = (page - 1) * limit;

  const where: any = { shopId };

  if (filters.type) {
    where.type = filters.type;
  }
  if (filters.status) {
    where.status = filters.status;
  }
  if (filters.itemId) {
    where.itemId = filters.itemId;
  }
  if (filters.supplierId) {
    where.supplierId = filters.supplierId;
  }
  if (filters.startDate || filters.endDate) {
    where.date = {};
    if (filters.startDate) {
      where.date.gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      where.date.lte = end;
    }
  }

  const [transactions, total] = await Promise.all([
    prisma.stockTransaction.findMany({
      where,
      skip,
      take: limit,
      orderBy: { date: 'desc' },
      include: {
        item: true,
        supplier: true,
        createdByUser: { select: safeUserSelect }
      },
    }),
    prisma.stockTransaction.count({ where }),
  ]);

  res.status(200).json({
    success: true,
    transactions,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
}

export async function getTransactionById(req: Request, res: Response) {
  const { shopId } = getShopAndUserId(req);
  const { id } = req.params;

  const transaction = await prisma.stockTransaction.findFirst({
    where: { id, shopId },
    include: {
      item: true,
      supplier: true,
      createdByUser: { select: safeUserSelect }
    },
  });

  if (!transaction) {
    throw new NotFoundError('Stock transaction not found in your shop.');
  }

  res.status(200).json({
    success: true,
    transaction,
  });
}
