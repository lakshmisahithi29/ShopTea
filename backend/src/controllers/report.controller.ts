import { Request, Response } from 'express';
import { UnauthorizedError } from '../utils/errors';
import { buildReport, reportToCsv, type ReportExportType, type ReportQuery } from '../services/report.service';

function shopId(req: Request): string {
  const id = req.user?.shopId;
  if (!id) throw new UnauthorizedError('Shop profile required. Please complete shop setup.');
  return id;
}

/** GET /api/reports/overview */
export async function getReportOverview(req: Request, res: Response) {
  const report = await buildReport(shopId(req), req.query as unknown as ReportQuery);
  res.status(200).json({ success: true, report });
}

/** GET /api/reports/export */
export async function exportReport(req: Request, res: Response) {
  const query = req.query as unknown as ReportQuery & { type: ReportExportType };
  const report = await buildReport(shopId(req), query);
  const type = query.type || 'sales';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="shoptea-${type}-${report.range.from}-to-${report.range.to}.csv"`);
  res.status(200).send(reportToCsv(type, report));
}
