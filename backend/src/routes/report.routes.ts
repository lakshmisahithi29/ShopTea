import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { exportReport, getReportOverview } from '../controllers/report.controller';
import { reportExportQuerySchema, reportQuerySchema } from '../validations/report.validation';

const router = Router();
router.use(requireAuth);
router.get('/overview', validateRequest({ query: reportQuerySchema }), asyncHandler(getReportOverview));
router.get('/export', validateRequest({ query: reportExportQuerySchema }), asyncHandler(exportReport));
export default router;
