import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { getAlerts, getAlertSummary, markAlertRead, markAllAlertsRead } from '../controllers/alert.controller';
import { alertIdParamSchema, alertListQuerySchema } from '../validations/alert.validation';

const router = Router();
router.use(requireAuth);

router.get('/', validateRequest({ query: alertListQuerySchema }), asyncHandler(getAlerts));
router.get('/summary', asyncHandler(getAlertSummary));
router.post('/read-all', asyncHandler(markAllAlertsRead));
router.post('/:id/read', validateRequest({ params: alertIdParamSchema }), asyncHandler(markAlertRead));

export default router;
