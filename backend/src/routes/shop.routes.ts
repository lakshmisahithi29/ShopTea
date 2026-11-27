import { Router } from 'express';
import { createShop, getShop, updateShop } from '../controllers/shop.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { createShopSchema, updateShopSchema } from '../validations/shop.validation';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.post('/', requireAuth, validateRequest({ body: createShopSchema }), asyncHandler(createShop));
router.get('/', requireAuth, asyncHandler(getShop));
router.patch('/', requireAuth, validateRequest({ body: updateShopSchema }), asyncHandler(updateShop));

export default router;
