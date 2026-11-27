import { Request, Response } from 'express';
import { PurchaseService } from '../services/purchase.service';
import { UnauthorizedError } from '../utils/errors';

function getContext(req: Request) {
  const shopId = req.user?.shopId;
  const userId = req.user?.id;
  if (!shopId || !userId) {
    throw new UnauthorizedError('Shop profile required. Please complete shop setup.');
  }
  return { shopId, userId };
}

export async function createPurchase(req: Request, res: Response) {
  const { shopId, userId } = getContext(req);
  const result = await PurchaseService.create(shopId, userId, req.body);
  res.status(result.isDuplicate ? 200 : 201).json({
    success: true,
    message: result.isDuplicate ? 'Purchase already recorded.' : 'Purchase recorded and inventory updated.',
    ...result,
  });
}

export async function getPurchases(req: Request, res: Response) {
  const { shopId } = getContext(req);
  const result = await PurchaseService.list(shopId, req.query);
  res.status(200).json({ success: true, ...result });
}

export async function getPurchase(req: Request, res: Response) {
  const { shopId } = getContext(req);
  const purchase = await PurchaseService.getById(shopId, req.params.id);
  res.status(200).json({ success: true, purchase });
}

export async function updatePurchase(req: Request, res: Response) {
  const { shopId, userId } = getContext(req);
  const result = await PurchaseService.update(shopId, userId, req.params.id, req.body);
  res.status(200).json({
    success: true,
    message: result.isDuplicate ? 'Purchase edit already applied.' : 'Purchase edited; stock and audit history updated.',
    ...result,
  });
}

export async function cancelPurchase(req: Request, res: Response) {
  const { shopId, userId } = getContext(req);
  const result = await PurchaseService.cancel(
    shopId,
    userId,
    req.params.id,
    req.body.reason,
    req.body.idempotencyKey,
  );
  res.status(200).json({
    success: true,
    message: result.isDuplicate ? 'Purchase cancellation already applied.' : 'Purchase cancelled and stock reversed.',
    ...result,
  });
}
