import { Request, Response } from 'express';
import { UsageService } from '../services/usage.service';
import { UnauthorizedError } from '../utils/errors';

function context(req: Request) {
  const shopId = req.user?.shopId;
  const userId = req.user?.id;
  if (!shopId || !userId) throw new UnauthorizedError('Shop profile required. Please complete shop setup.');
  return { shopId, userId };
}

export async function getUsageRecords(req: Request, res: Response) {
  const { shopId } = context(req);
  res.status(200).json({ success: true, ...await UsageService.list(shopId, req.query) });
}

export async function getUsageRecord(req: Request, res: Response) {
  const { shopId } = context(req);
  const usage = await UsageService.getById(shopId, req.params.id);
  res.status(200).json({ success: true, usage });
}

export async function createUsageRecord(req: Request, res: Response) {
  const { shopId, userId } = context(req);
  const result = await UsageService.create(shopId, userId, req.body);
  res.status(result.isDuplicate ? 200 : 201).json({
    success: true,
    message: result.isDuplicate ? 'Usage already recorded; stock was not deducted twice.' : 'Stock usage recorded for all selected items.',
    ...result,
  });
}

export async function cancelUsageRecord(req: Request, res: Response) {
  const { shopId, userId } = context(req);
  const result = await UsageService.cancel(shopId, userId, req.params.id, req.body.reason, req.body.idempotencyKey);
  res.status(200).json({
    success: true,
    message: result.isDuplicate ? 'Usage cancellation already applied.' : 'Usage cancelled and stock restored.',
    ...result,
  });
}
