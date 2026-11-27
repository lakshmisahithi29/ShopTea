import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import {
  cancelPurchase,
  createPurchase,
  getPurchase,
  getPurchases,
  updatePurchase,
} from '../controllers/purchase.controller';
import { purchaseTransactionSchema } from '../validations/transaction.validation';
import {
  purchaseCancelSchema,
  purchaseEditSchema,
  purchaseListQuerySchema,
} from '../validations/purchase.validation';

const router = Router();

router.get('/', requireAuth, validateRequest({ query: purchaseListQuerySchema }), asyncHandler(getPurchases));
router.post('/', requireAuth, validateRequest({ body: purchaseTransactionSchema }), asyncHandler(createPurchase));
router.get('/:id', requireAuth, asyncHandler(getPurchase));
router.patch('/:id', requireAuth, validateRequest({ body: purchaseEditSchema }), asyncHandler(updatePurchase));
router.post('/:id/cancel', requireAuth, validateRequest({ body: purchaseCancelSchema }), asyncHandler(cancelPurchase));

export default router;
