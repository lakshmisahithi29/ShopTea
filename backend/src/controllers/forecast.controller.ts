import { Request, Response } from 'express';
import { buildForecast, ForecastQuery } from '../services/forecast.service';
import { UnauthorizedError } from '../utils/errors';

export async function getForecast(req: Request, res: Response) {
  const shopId = req.user?.shopId;
  if (!shopId) {
    throw new UnauthorizedError('Shop profile required. Please complete shop setup.');
  }
  const forecast = await buildForecast(shopId, req.query as unknown as ForecastQuery);
  res.status(200).json({ success: true, forecast });
}
