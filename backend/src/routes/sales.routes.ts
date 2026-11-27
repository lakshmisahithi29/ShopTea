import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { cancelSale, createSale, getSale, getSales } from '../controllers/sales.controller';
import { saleCancelSchema, saleCreateSchema, saleListQuerySchema } from '../validations/sales.validation';

const router = Router();
router.get('/', requireAuth, validateRequest({ query: saleListQuerySchema }), asyncHandler(getSales));
router.post('/', requireAuth, validateRequest({ body: saleCreateSchema }), asyncHandler(createSale));
router.get('/:id', requireAuth, asyncHandler(getSale));
router.post('/:id/cancel', requireAuth, validateRequest({ body: saleCancelSchema }), asyncHandler(cancelSale));
export default router;
