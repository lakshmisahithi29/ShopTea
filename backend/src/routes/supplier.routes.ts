import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import {
  createSupplier,
  getSuppliers,
  getSupplierById,
  updateSupplier,
  getSupplierPurchases,
} from '../controllers/supplier.controller';
import {
  createSupplierSchema,
  updateSupplierSchema,
} from '../validations/supplier.validation';

const router = Router();

router.post(
  '/',
  requireAuth,
  validateRequest({ body: createSupplierSchema }),
  asyncHandler(createSupplier)
);

router.get('/', requireAuth, asyncHandler(getSuppliers));
router.get('/:id', requireAuth, asyncHandler(getSupplierById));

router.patch(
  '/:id',
  requireAuth,
  validateRequest({ body: updateSupplierSchema }),
  asyncHandler(updateSupplier)
);

router.get('/:id/purchases', requireAuth, asyncHandler(getSupplierPurchases));

export default router;
