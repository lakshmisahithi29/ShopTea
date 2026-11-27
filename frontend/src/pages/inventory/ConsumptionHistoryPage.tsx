import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Eye, PackageMinus, Plus, X } from 'lucide-react';
import { api } from '../../api/client';
import { getUsageRecord, getUsageRecords } from '../../api/usage';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../../components/common/UI';
import { useAuth } from '../../context/AuthContext';
import { InventoryItem, StockUsage, TransactionStatus } from '../../types';
import { formatMoney, formatQty } from '../../utils/format';

const inputClass = 'border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const ConsumptionHistoryPage: React.FC = () => {
  const { shop } = useAuth();
  const [records, setRecords] = React.useState<StockUsage[]>([]);
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [summary, setSummary] = React.useState({ activeUsageCount: 0, totalCost: 0 });
  const [filterItem, setFilterItem] = React.useState('');
  const [filterStatus, setFilterStatus] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [detail, setDetail] = React.useState<StockUsage | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const money = (value: number) => formatMoney(value, shop?.currency || 'INR');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [usage, itemResponse] = await Promise.all([
        getUsageRecords({
          page,
          limit: 15,
          ...(filterItem ? { itemId: filterItem } : {}),
          ...(filterStatus ? { status: filterStatus as TransactionStatus } : {}),
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
        }),
        api.get('/items'),
      ]);
      setRecords(usage.usageRecords || []);
      setTotal(usage.pagination.total);
      setTotalPages(Math.max(1, usage.pagination.totalPages));
      setSummary(usage.summary);
      setItems(itemResponse.data.items || []);
      if (page > 1 && usage.usageRecords.length === 0) setPage((current) => current - 1);
    } catch (err: any) {
      setError(err.message || 'Consumption history could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [page, filterItem, filterStatus, startDate, endDate]);

  React.useEffect(() => { void load(); }, [load]);

  const openDetails = async (record: StockUsage) => {
    setDetail(record);
    setDetailLoading(true);
    setError('');
    try { setDetail(await getUsageRecord(record.id)); } catch (err: any) { setError(err.message); } finally { setDetailLoading(false); }
  };

  const clearFilters = () => {
    setFilterItem('');
    setFilterStatus('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Consumption history"
        description="Review manual stock usage, recorded costs, cancellations, and linked reversal movements."
        actions={<Link to="/usage/new" className="inline-flex items-center gap-2 rounded-lg px-4 py-2 bg-amber-600 text-white text-sm font-semibold"><Plus className="h-4 w-4" /> Record usage</Link>}
      />

      {error ? <ErrorState message={error} onRetry={load} /> : null}

      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <Card><p className="text-xs uppercase tracking-wide text-slate-500">Matching records</p><p className="text-2xl font-bold mt-1">{total}</p></Card>
        <Card><p className="text-xs uppercase tracking-wide text-slate-500">Active usage records</p><p className="text-2xl font-bold mt-1">{summary.activeUsageCount}</p></Card>
        <Card><p className="text-xs uppercase tracking-wide text-slate-500">Recorded usage cost</p><p className="text-2xl font-bold mt-1">{money(summary.totalCost)}</p><p className="text-xs text-slate-500 mt-1">Weighted-average cost snapshots</p></Card>
      </div>

      <Card>
        <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-2 mb-5">
          <select aria-label="Filter consumption by item" value={filterItem} onChange={(event) => { setFilterItem(event.target.value); setPage(1); }} className={inputClass}><option value="">All inventory items</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select aria-label="Filter consumption by status" value={filterStatus} onChange={(event) => { setFilterStatus(event.target.value); setPage(1); }} className={inputClass}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="CANCELLED">Cancelled</option></select>
          <label className="relative"><CalendarDays className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input aria-label="Consumption start date" type="date" value={startDate} max={endDate || undefined} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} className={`${inputClass} pl-9 w-full`} /></label>
          <label className="relative"><CalendarDays className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input aria-label="Consumption end date" type="date" value={endDate} min={startDate || undefined} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} className={`${inputClass} pl-9 w-full`} /></label>
          <Button type="button" variant="secondary" onClick={clearFilters} disabled={!filterItem && !filterStatus && !startDate && !endDate}>Clear filters</Button>
        </div>

        {loading ? <LoadingState label="Loading consumption history…" /> : records.length === 0 ? (
          <EmptyState icon={PackageMinus} title="No usage records found" description="Record manual consumption or clear the filters to see more history." action={<Link to="/usage/new" className="text-sm font-semibold text-amber-700">Record usage</Link>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[850px]">
              <thead className="text-left text-slate-500 border-b"><tr><th className="py-2 pr-4">Date / reference</th><th className="pr-4">Items consumed</th><th className="pr-4 text-right">Usage cost</th><th className="pr-4">Status</th><th className="pr-4">Notes</th><th className="text-right">Details</th></tr></thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-b last:border-0 align-top">
                    <td className="py-3 pr-4"><p className="font-semibold text-slate-900">{formatDate(record.date)}</p><p className="text-xs text-slate-500 mt-1">{record.reference || record.id.slice(0, 8)}</p></td>
                    <td className="py-3 pr-4"><p>{record.items.map((item) => `${formatQty(item.quantity)} ${item.unit} ${item.name}`).join(', ')}</p><p className="text-xs text-slate-500 mt-1">{record.items.length} inventory items</p></td>
                    <td className="py-3 pr-4 text-right font-semibold whitespace-nowrap">{money(record.totalCost)}</td>
                    <td className="py-3 pr-4"><StatusBadge tone={record.status === 'ACTIVE' ? 'success' : 'danger'}>{record.status}</StatusBadge></td>
                    <td className="py-3 pr-4 max-w-[220px] truncate" title={record.notes || ''}>{record.notes || '—'}</td>
                    <td className="py-3 text-right"><Button type="button" variant="ghost" onClick={() => void openDetails(record)} className="px-2 py-1"><Eye className="h-4 w-4" /> View</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between mt-5">
          <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} className="inline-flex items-center gap-1 text-sm disabled:text-slate-300"><ChevronLeft className="h-4 w-4" /> Previous</button>
          <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
          <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)} className="inline-flex items-center gap-1 text-sm disabled:text-slate-300">Next <ChevronRight className="h-4 w-4" /></button>
        </div>
      </Card>

      {detail ? (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="consumption-detail-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !detailLoading) setDetail(null); }}>
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-5">
            <div className="flex items-start justify-between gap-3 mb-4"><div><h2 id="consumption-detail-title" className="text-lg font-bold text-slate-900">Consumption details</h2><p className="text-xs text-slate-500 mt-1">{detail.id}</p></div><button type="button" onClick={() => setDetail(null)} className="p-2 hover:bg-slate-100 rounded-lg" aria-label="Close details"><X className="h-5 w-5" /></button></div>
            {detailLoading ? <LoadingState label="Loading details…" /> : <>
              <div className="grid sm:grid-cols-3 gap-3 mb-5 text-sm"><Card className="!p-3"><p className="text-xs text-slate-500">Recorded cost</p><p className="font-bold text-lg mt-1">{money(detail.totalCost)}</p></Card><Card className="!p-3"><p className="text-xs text-slate-500">Status</p><StatusBadge tone={detail.status === 'ACTIVE' ? 'success' : 'danger'}>{detail.status}</StatusBadge></Card><Card className="!p-3"><p className="text-xs text-slate-500">Recorded by</p><p className="font-semibold mt-1">{detail.createdByUser?.name || detail.createdByUser?.username || '—'}</p></Card></div>
              <h3 className="font-semibold text-slate-900 mb-2">Consumed items</h3>
              <div className="overflow-x-auto mb-5"><table className="w-full text-sm"><thead className="text-left text-slate-500 border-b"><tr><th className="py-2">Item</th><th className="py-2 text-right">Quantity</th><th className="py-2 text-right">Unit cost</th><th className="py-2 text-right">Total</th></tr></thead><tbody>{detail.items.map((item) => <tr key={item.id} className="border-b"><td className="py-2">{item.name}</td><td className="py-2 text-right">{formatQty(item.quantity)} {item.unit}</td><td className="py-2 text-right">{money(item.unitCost)}</td><td className="py-2 text-right font-semibold">{money(item.totalCost)}</td></tr>)}</tbody></table></div>
              <h3 className="font-semibold text-slate-900 mb-2">Stock movements</h3>
              <ul className="space-y-2">{detail.movements.map((movement) => <li key={movement.id} className="flex flex-wrap justify-between gap-2 bg-slate-50 rounded-lg px-3 py-2 text-sm"><span>{movement.type} · {movement.item?.name || movement.itemId} · {formatQty(movement.quantity)} {movement.item?.unit}</span><span className="text-slate-500">{movement.status} · {money(Number(movement.totalCost) || 0)}</span></li>)}</ul>
              {detail.status === 'ACTIVE' ? <div className="mt-5 border-t pt-4"><Link to="/usage" className="text-sm font-semibold text-amber-700">Open daily usage to manage or reverse this record</Link></div> : null}
            </>}
          </div>
        </div>
      ) : null}
    </div>
  );
};
