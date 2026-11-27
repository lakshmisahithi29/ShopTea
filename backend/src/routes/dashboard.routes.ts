import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { dashboardRangeQuerySchema } from '../validations/dashboard.validation';
import {
  getDashboardSummary,
  getRecentMovements,
  getMovementTrend,
  getWastageSummary,
  getWastageTrend,
  getDashboardReplenishment,
} from '../controllers/dashboard.controller';

const router = Router();

router.use(requireAuth);

router.get('/summary', asyncHandler(getDashboardSummary));
router.get('/recent-movements', asyncHandler(getRecentMovements));
router.get(
  '/movement-trend',
  validateRequest({ query: dashboardRangeQuerySchema }),
  asyncHandler(getMovementTrend)
);
router.get(
  '/wastage-summary',
  validateRequest({ query: dashboardRangeQuerySchema }),
  asyncHandler(getWastageSummary)
);
router.get(
  '/wastage-trend',
  validateRequest({ query: dashboardRangeQuerySchema }),
  asyncHandler(getWastageTrend)
);
router.get('/replenishment', asyncHandler(getDashboardReplenishment));

export default router;
