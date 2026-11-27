import { Request, Response } from 'express';
import { SaleService } from '../services/sale.service';
import { UnauthorizedError } from '../utils/errors';

function context(req: Request) {
  const shopId = req.user?.shopId;
  const userId = req.user?.id;
  if (!shopId || !userId) throw new UnauthorizedError('Shop profile required. Please complete shop setup.');
  return { shopId, userId };
}

export async function getSales(req: Request, res: Response) {
  const { shopId } = context(req);
  res.status(200).json({ success: true, ...await SaleService.list(shopId, req.query) });
}

export async function getSale(req: Request, res: Response) {
  const { shopId } = context(req);
  const sale = await SaleService.getById(shopId, req.params.id);
  res.status(200).json({ success: true, sale });
}

export async function createSale(req: Request, res: Response) {
  const { shopId, userId } = context(req);
  const result = await SaleService.create(shopId, userId, req.body);
  res.status(result.isDuplicate ? 200 : 201).json({
    success: true,
    message: result.isDuplicate ? 'Sale already recorded; stock was not deducted twice.' : 'Sale recorded and recipe stock deducted.',
    ...result,
  });
}

export async function cancelSale(req: Request, res: Response) {
  const { shopId, userId } = context(req);
  const result = await SaleService.cancel(shopId, userId, req.params.id, req.body.reason, req.body.idempotencyKey);
  res.status(200).json({
    success: true,
    message: result.isDuplicate ? 'Sale cancellation already applied.' : 'Sale cancelled and recipe stock restored.',
    ...result,
  });
}
