import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import {
  createPurchase,
  createUsage,
  createWastage,
  createAdjustment,
  getTransactions,
  getTransactionById,
} from '../controllers/transaction.controller';
import {
  purchaseTransactionSchema,
  usageTransactionSchema,
  wastageTransactionSchema,
  adjustmentTransactionSchema,
  transactionFilterSchema,
} from '../validations/transaction.validation';

const router = Router();

router.post(
  '/purchase',
  requireAuth,
  validateRequest({ body: purchaseTransactionSchema }),
  asyncHandler(createPurchase)
);

router.post(
  '/usage',
  requireAuth,
  validateRequest({ body: usageTransactionSchema }),
  asyncHandler(createUsage)
);

router.post(
  '/wastage',
  requireAuth,
  validateRequest({ body: wastageTransactionSchema }),
  asyncHandler(createWastage)
);

router.post(
  '/adjustment',
  requireAuth,
  validateRequest({ body: adjustmentTransactionSchema }),
  asyncHandler(createAdjustment)
);

router.get('/', requireAuth, validateRequest({ query: transactionFilterSchema }), asyncHandler(getTransactions));
router.get('/:id', requireAuth, asyncHandler(getTransactionById));

export default router;
