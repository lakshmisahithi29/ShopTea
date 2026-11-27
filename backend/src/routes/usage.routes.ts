import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { cancelUsageRecord, createUsageRecord, getUsageRecord, getUsageRecords } from '../controllers/usage.controller';
import { usageCancelSchema, usageCreateSchema, usageListQuerySchema } from '../validations/usage.validation';

const router = Router();
router.get('/', requireAuth, validateRequest({ query: usageListQuerySchema }), asyncHandler(getUsageRecords));
router.post('/', requireAuth, validateRequest({ body: usageCreateSchema }), asyncHandler(createUsageRecord));
router.get('/:id', requireAuth, asyncHandler(getUsageRecord));
router.post('/:id/cancel', requireAuth, validateRequest({ body: usageCancelSchema }), asyncHandler(cancelUsageRecord));
export default router;
