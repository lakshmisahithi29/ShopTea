import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import {
  getItems,
  getItemById,
  createItem,
  updateItem,
  updateStockLevels,
} from '../controllers/item.controller';
import {
  createItemSchema,
  updateItemSchema,
  itemListQuerySchema,
} from '../validations/item.validation';
import { updateLevelsSchema } from '../validations/replenishment.validation';

const router = Router();

router.get(
  '/',
  requireAuth,
  validateRequest({ query: itemListQuerySchema }),
  asyncHandler(getItems)
);
router.get('/:id', requireAuth, asyncHandler(getItemById));

router.post(
  '/',
  requireAuth,
  validateRequest({ body: createItemSchema }),
  asyncHandler(createItem)
);

router.patch(
  '/:id/levels',
  requireAuth,
  validateRequest({ body: updateLevelsSchema }),
  asyncHandler(updateStockLevels)
);

router.patch(
  '/:id',
  requireAuth,
  validateRequest({ body: updateItemSchema }),
  asyncHandler(updateItem)
);

export default router;
