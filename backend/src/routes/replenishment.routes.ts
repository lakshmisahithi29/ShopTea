import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import {
  getAlerts,
  getReorderList,
  getReplenishmentSummary,
} from '../controllers/replenishment.controller';
import { reorderListQuerySchema } from '../validations/replenishment.validation';

const router = Router();

router.use(requireAuth);

router.get('/alerts', asyncHandler(getAlerts));
router.get(
  '/reorder-list',
  validateRequest({ query: reorderListQuerySchema }),
  asyncHandler(getReorderList)
);
router.get('/summary', asyncHandler(getReplenishmentSummary));

export default router;
