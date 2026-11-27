import { Request, Response } from 'express';
import { MenuService } from '../services/menu.service';
import { UnauthorizedError } from '../utils/errors';

function shopId(req: Request) {
  const id = req.user?.shopId;
  if (!id) throw new UnauthorizedError('Shop profile required. Please complete shop setup.');
  return id;
}

export async function getMenuItems(req: Request, res: Response) {
  res.status(200).json({ success: true, ...await MenuService.list(shopId(req), req.query) });
}

export async function getMenuItem(req: Request, res: Response) {
  const menuItem = await MenuService.getById(shopId(req), req.params.id);
  res.status(200).json({ success: true, menuItem });
}

export async function createMenuItem(req: Request, res: Response) {
  const menuItem = await MenuService.create(shopId(req), req.body);
  res.status(201).json({ success: true, message: 'Menu item and recipe saved.', menuItem });
}

export async function updateMenuItem(req: Request, res: Response) {
  const menuItem = await MenuService.update(shopId(req), req.params.id, req.body);
  res.status(200).json({ success: true, message: 'Menu item and recipe updated.', menuItem });
}
