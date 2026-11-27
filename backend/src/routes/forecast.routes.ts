import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { forecastQuerySchema } from '../validations/forecast.validation';
import { getForecast } from '../controllers/forecast.controller';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  validateRequest({ query: forecastQuerySchema }),
  asyncHandler(getForecast)
);

export default router;
