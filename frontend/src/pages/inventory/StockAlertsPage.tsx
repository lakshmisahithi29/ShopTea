import React from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, ChevronLeft, ChevronRight, PackagePlus, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { getAlertSummary, listAlerts, markAlertRead, markAllAlertsRead } from '../../api/alerts';
import type { StockAlert, StockAlertStatus, StockAlertSummary, StockAlertType } from '../../types';
import { formatQty } from '../../utils/format';

const TYPE_LABEL: Record<StockAlertType, string> = {
  OUT_OF_STOCK: 'Out of stock',
  LOW_STOCK: 'Low stock',
  NEEDS_REORDER: 'Needs reorder',
};

const TYPE_CLASS: Record<StockAlertType, string> = {
  OUT_OF_STOCK: 'bg-red-100 text-red-800',
  LOW_STOCK: 'bg-amber-100 text-amber-800',
  NEEDS_REORDER: 'bg-orange-100 text-orange-800',
};

const EMPTY_SUMMARY: StockAlertSummary = {
  activeCount: 0,
  unreadCount: 0,
  outOfStockCount: 0,
  lowStockCount: 0,
  needsReorderCount: 0,
};

export const StockAlertsPage: React.FC = () => {
  const [alerts, setAlerts] = React.useState<StockAlert[]>([]);
  const [summary, setSummary] = React.useState<StockAlertSummary>(EMPTY_SUMMARY);
  const [pagination, setPagination] = React.useState({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [status, setStatus] = React.useState<StockAlertStatus>('ACTIVE');
  const [type, setType] = React.useState<StockAlertType | ''>('');
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [savingId, setSavingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, nextSummary] = await Promise.all([
        listAlerts({ status, ...(type ? { type } : {}), page, limit: 20 }),
        getAlertSummary(),
      ]);
      setAlerts(list.alerts);
      setPagination(list.pagination);
      setSummary(nextSummary);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [status, type, page]);

  React.useEffect(() => {
    load();
  }, [load]);

  const read = async (alert: StockAlert) => {
    setSavingId(alert.id);
    setError('');
    setSuccess('');
    try {
      await markAlertRead(alert.id);
      setSuccess('Notification marked as read.');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingId(null);
    }
  };

  const readAll = async () => {
    setSavingId('all');
    setError('');
    setSuccess('');
    try {
      const result = await markAllAlertsRead();
      setSuccess(result.updatedCount ? `${result.updatedCount} notification${result.updatedCount === 1 ? '' : 's'} marked as read.` : 'All notifications are already read.');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Stock alerts</h1>
          <p className="text-sm text-slate-500">Persistent notifications generated from your current stock and configured thresholds.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 px-3 py-2 bg-white border rounded-lg text-sm disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={readAll} disabled={loading || savingId === 'all' || summary.unreadCount === 0} className="inline-flex items-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-lg text-sm disabled:opacity-50">
            <CheckCheck className="h-4 w-4" /> Mark all read
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Summary label="Active" value={summary.activeCount} />
        <Summary label="Unread" value={summary.unreadCount} />
        <Summary label="Out of stock" value={summary.outOfStockCount} alert={summary.outOfStockCount > 0} />
        <Summary label="Low stock" value={summary.lowStockCount} alert={summary.lowStockCount > 0} />
        <Summary label="Needs reorder" value={summary.needsReorderCount} alert={summary.needsReorderCount > 0} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Status
          <select value={status} onChange={(e) => { setStatus(e.target.value as StockAlertStatus); setPage(1); }} className="border rounded-lg px-3 py-2 bg-white">
            <option value="ACTIVE">Active notifications</option>
            <option value="RESOLVED">Resolved history</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Type
          <select value={type} onChange={(e) => { setType(e.target.value as StockAlertType | ''); setPage(1); }} className="border rounded-lg px-3 py-2 bg-white">
            <option value="">All alert types</option>
            <option value="OUT_OF_STOCK">Out of stock</option>
            <option value="LOW_STOCK">Low stock</option>
            <option value="NEEDS_REORDER">Needs reorder</option>
          </select>
        </label>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      {success && <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">{success}</div>}

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-32 bg-white border rounded-xl animate-pulse" />)}</div>
      ) : alerts.length === 0 ? (
        <div className="bg-white border rounded-xl p-10 text-center">
          <Bell className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-900">{status === 'ACTIVE' ? 'No active stock alerts' : 'No matching notification history'}</p>
          <p className="text-sm text-slate-500 mt-1">{status === 'ACTIVE' ? 'Your active inventory is above the configured alert thresholds.' : 'Resolved alerts will appear here after stock conditions change.'}</p>
          <Link to="/inventory" className="inline-block mt-4 text-sm text-amber-700 font-semibold">Review inventory</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <article key={alert.id} className={`bg-white border rounded-xl p-4 sm:p-5 ${alert.status === 'ACTIVE' && !alert.readAt ? 'border-l-4 border-l-amber-500' : 'border-slate-200'}`}>
              <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${TYPE_CLASS[alert.type]}`}>{TYPE_LABEL[alert.type]}</span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${alert.status === 'ACTIVE' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-700'}`}>{alert.status}</span>
                    {!alert.readAt && <span className="h-2 w-2 rounded-full bg-amber-500" title="Unread" />}
                  </div>
                  <h2 className="font-semibold text-slate-900 mt-2">{alert.item?.name || alert.title}</h2>
                  <p className="text-sm text-slate-600 mt-1">{alert.message}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mt-3">
                    <span>Current: {formatQty(alert.currentStock)} {alert.item?.unit}</span>
                    <span>Minimum: {formatQty(alert.minStock)}</span>
                    <span>Reorder: {formatQty(alert.reorderLevel)}</span>
                    <span>Suggested: {formatQty(alert.suggestedQty)} {alert.item?.unit}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    Triggered {new Date(alert.triggeredAt).toLocaleString()}
                    {alert.resolvedAt ? ` · Resolved ${new Date(alert.resolvedAt).toLocaleString()}` : ''}
                  </p>
                  {alert.resolutionReason && <p className="text-xs text-slate-500 mt-1">{alert.resolutionReason}</p>}
                </div>
                <div className="flex flex-wrap lg:flex-col gap-2 lg:items-end">
                  {alert.status === 'ACTIVE' && !alert.readAt && (
                    <button onClick={() => read(alert)} disabled={savingId === alert.id} className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-50">Mark read</button>
                  )}
                  {alert.status === 'ACTIVE' && (
                    <>
                      <Link to={`/transactions/purchase?itemId=${alert.itemId}&quantity=${alert.suggestedQty}&supplierId=${alert.item?.supplierId || ''}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm">
                        <PackagePlus className="h-4 w-4" /> Purchase
                      </Link>
                      <Link to="/reorder" className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm">
                        <SlidersHorizontal className="h-4 w-4" /> Thresholds
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-5 text-sm">
          <span className="text-slate-500">Page {pagination.page} of {pagination.totalPages} · {pagination.total} notifications</span>
          <div className="flex gap-2">
            <button aria-label="Previous page" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="p-2 border rounded-lg disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
            <button aria-label="Next page" onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} disabled={page >= pagination.totalPages} className="p-2 border rounded-lg disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
};

function Summary({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="bg-white border rounded-xl p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${alert ? 'text-red-700' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}
