import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Ban, CalendarDays, ChevronLeft, ChevronRight, Eye, PackageMinus, Plus, Trash2, X } from 'lucide-react';
import { api } from '../../api/client';
import { cancelUsageRecord, createUsageRecord, getUsageRecord, getUsageRecords } from '../../api/usage';
import { useAuth } from '../../context/AuthContext';
import { InventoryItem, ItemUnit, StockUsage, TransactionStatus } from '../../types';
import { formatMoney, formatQty, todayIso } from '../../utils/format';

type UsageLine = { itemId: string; quantity: string; inputUnit: ItemUnit };
type UsageForm = { reference: string; notes: string; date: string; items: UsageLine[] };

const labelClass = 'block text-sm font-semibold mb-1 text-slate-700';
const inputClass = 'w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100';
const emptyForm = (): UsageForm => ({ reference: '', notes: '', date: todayIso(), items: [{ itemId: '', quantity: '', inputUnit: 'KG' }] });

function compatibleUnits(unit: ItemUnit): ItemUnit[] {
  if (unit === 'KG' || unit === 'G') return ['KG', 'G'];
  if (unit === 'LITRES' || unit === 'ML') return ['LITRES', 'ML'];
  return [unit];
}

function conversionFactor(inputUnit: ItemUnit, baseUnit: ItemUnit): number {
  if (inputUnit === baseUnit) return 1;
  if (baseUnit === 'KG' && inputUnit === 'G') return 0.001;
  if (baseUnit === 'G' && inputUnit === 'KG') return 1000;
  if (baseUnit === 'LITRES' && inputUnit === 'ML') return 0.001;
  if (baseUnit === 'ML' && inputUnit === 'LITRES') return 1000;
  return Number.NaN;
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
}

export const DailyUsagePage: React.FC = () => {
  const { shop } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [records, setRecords] = React.useState<StockUsage[]>([]);
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [form, setForm] = React.useState<UsageForm>(emptyForm);
  const [formOpen, setFormOpen] = React.useState(location.pathname === '/usage/new');
  const [requestKey, setRequestKey] = React.useState(() => crypto.randomUUID());
  const [detail, setDetail] = React.useState<StockUsage | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<StockUsage | null>(null);
  const [cancelReason, setCancelReason] = React.useState('');
  const [cancelKey, setCancelKey] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [summary, setSummary] = React.useState({ activeUsageCount: 0, totalCost: 0 });
  const [filterItem, setFilterItem] = React.useState('');
  const [filterStatus, setFilterStatus] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const money = (value: number) => formatMoney(Number(value) || 0, shop?.currency || 'INR');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [usageResponse, itemResponse] = await Promise.all([
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
      setRecords(usageResponse.usageRecords || []);
      setTotal(usageResponse.pagination.total);
      setTotalPages(Math.max(1, usageResponse.pagination.totalPages));
      setSummary(usageResponse.summary);
      setItems(itemResponse.data.items || []);
      if (page > 1 && usageResponse.usageRecords.length === 0) setPage((current) => current - 1);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filterItem, filterStatus, startDate, endDate]);

  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => { setFormOpen(location.pathname === '/usage/new'); }, [location.pathname]);

  const itemById = new Map(items.map((item) => [item.id, item]));
  const normalizedLines = form.items.map((line) => {
    const item = itemById.get(line.itemId);
    const quantity = Number(line.quantity);
    const normalized = item ? quantity * conversionFactor(line.inputUnit, item.unit) : quantity;
    return { item, quantity, normalized, cost: item ? normalized * Number(item.unitCost) : 0 };
  });
  const totalCost = normalizedLines.reduce((sum, line) => sum + (Number.isFinite(line.cost) ? line.cost : 0), 0);
  const validLines = form.items.filter((line) => line.itemId && Number(line.quantity) > 0);
  const selectedIds = form.items.map((line) => line.itemId).filter(Boolean);
  const hasDuplicates = new Set(selectedIds).size !== selectedIds.length;
  const shortages = normalizedLines.filter((line) => line.item && line.normalized > Number(line.item.currentStock));

  const resetForm = () => {
    setForm(emptyForm());
    setRequestKey(crypto.randomUUID());
    setFormOpen(false);
  };

  const openCreate = () => {
    resetForm();
    setFormOpen(true);
    setError('');
    setSuccess('');
    navigate('/usage/new');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateLine = (index: number, patch: Partial<UsageLine>) => {
    setForm((current) => ({ ...current, items: current.items.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line) }));
  };

  const selectItem = (index: number, itemId: string) => {
    const item = itemById.get(itemId);
    updateLine(index, { itemId, inputUnit: item?.unit || 'KG' });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (hasDuplicates || validLines.length !== form.items.length) {
      setError('Choose each inventory item once and enter a quantity greater than zero.');
      return;
    }
    const invalid = normalizedLines.find((line) => !line.item || !line.item.isActive || !Number.isFinite(line.normalized) || line.normalized <= 0 || ((line.item.unit === 'PIECES' || line.item.unit === 'PACKETS') && !Number.isInteger(line.normalized)));
    if (invalid) {
      setError(`Check the quantity and compatible unit for ${invalid.item?.name || 'the selected item'}. Packets and pieces require whole quantities.`);
      return;
    }
    if (shortages.length > 0) {
      setError(`Insufficient stock: ${shortages.map((line) => line.item?.name).join(', ')}.`);
      return;
    }
    setSaving(true);
    try {
      const result = await createUsageRecord({
        items: validLines.map((line) => ({ itemId: line.itemId, quantity: Number(line.quantity), inputUnit: line.inputUnit })),
        reference: form.reference.trim() || null,
        notes: form.notes.trim() || null,
        date: form.date,
        idempotencyKey: requestKey,
      });
      setSuccess(result.isDuplicate ? 'This usage was already recorded; stock was not deducted twice.' : result.message);
      resetForm();
      setPage(1);
      if (filterStatus === 'CANCELLED') setFilterStatus('');
      navigate('/usage');
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openCancel = (record: StockUsage) => {
    setCancelTarget(record);
    setCancelReason('');
    setCancelKey(crypto.randomUUID());
    setError('');
  };

  const submitCancellation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cancelTarget || cancelReason.trim().length < 3) return;
    setSaving(true);
    setError('');
    try {
      const result = await cancelUsageRecord(cancelTarget.id, cancelReason.trim(), cancelKey);
      setSuccess(result.isDuplicate ? 'This cancellation was already applied.' : result.message);
      setCancelTarget(null);
      setCancelReason('');
      if (detail?.id === cancelTarget.id) setDetail(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div><h1 className="text-2xl font-bold text-slate-900">Daily stock usage</h1><p className="text-sm text-slate-500">Record preparation, tasting, or other consumption that is not tied to a sale.</p></div>
        <div className="flex gap-2">{formOpen && <button type="button" onClick={() => { resetForm(); navigate('/usage'); }} className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold">View history</button>}{!formOpen && <button type="button" onClick={openCreate} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold"><Plus className="h-4 w-4" /> Record usage</button>}</div>
      </div>

      {error && <div role="alert" className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      {success && <div role="status" className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">{success}</div>}

      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-white border rounded-xl p-4"><p className="text-xs font-semibold text-slate-500 uppercase">Matching records</p><p className="text-2xl font-bold mt-1">{total}</p></div>
        <div className="bg-white border rounded-xl p-4"><p className="text-xs font-semibold text-slate-500 uppercase">Active usage records</p><p className="text-2xl font-bold mt-1">{summary.activeUsageCount}</p></div>
        <div className="bg-white border rounded-xl p-4"><p className="text-xs font-semibold text-slate-500 uppercase">Recorded usage cost</p><p className="text-2xl font-bold mt-1">{money(summary.totalCost)}</p><p className="text-xs text-slate-500 mt-1">Weighted-average cost snapshots</p></div>
      </div>

      {formOpen && (
        <form onSubmit={submit} className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
          <div className="mb-4"><h2 className="font-semibold text-slate-900">Record manual stock usage</h2><p className="text-xs text-slate-500 mt-1">All selected items are deducted together. Nothing is saved if any line fails.</p></div>
          <div className="grid md:grid-cols-3 gap-3 mb-4"><div><label className={labelClass}>Usage date</label><input required type="date" max={todayIso()} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className={inputClass} /></div><div><label className={labelClass}>Reference</label><input maxLength={100} value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} className={inputClass} placeholder="Optional" /></div><div><label className={labelClass}>Notes</label><input maxLength={500} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={inputClass} placeholder="e.g. Morning preparation" /></div></div>
          <div className="space-y-3">
            <div className="hidden lg:grid grid-cols-[1fr_120px_140px_150px_120px_36px] gap-2 text-xs font-semibold text-slate-500"><span>Inventory item</span><span>Input unit</span><span>Quantity</span><span>Base quantity</span><span>Estimated cost</span><span /></div>
            {form.items.map((line, index) => {
              const item = itemById.get(line.itemId);
              const normalized = normalizedLines[index];
              return <div key={index} className="grid lg:grid-cols-[1fr_120px_140px_150px_120px_36px] sm:grid-cols-2 gap-2 items-end">
                <select required value={line.itemId} onChange={(event) => selectItem(index, event.target.value)} className={inputClass}><option value="">Choose inventory item</option>{items.filter((candidate) => candidate.isActive || candidate.id === line.itemId).map((candidate) => <option key={candidate.id} value={candidate.id} disabled={form.items.some((other, otherIndex) => otherIndex !== index && other.itemId === candidate.id)}>{candidate.name} ({formatQty(candidate.currentStock)} {candidate.unit})</option>)}</select>
                <select aria-label={`Input unit for usage line ${index + 1}`} value={line.inputUnit} onChange={(event) => updateLine(index, { inputUnit: event.target.value as ItemUnit })} className={inputClass}>{compatibleUnits(item?.unit || line.inputUnit).map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select>
                <input required aria-label={`Quantity for usage line ${index + 1}`} type="number" min="0.001" step={item?.unit === 'PIECES' || item?.unit === 'PACKETS' ? '1' : '0.001'} value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} className={inputClass} />
                <div className="h-10 flex items-center text-sm text-slate-600">{item && line.quantity ? `${formatQty(normalized.normalized)} ${item.unit}` : '-'}{normalized.item && normalized.normalized > Number(normalized.item.currentStock) && <span className="text-red-700 ml-1">(short)</span>}</div>
                <div className="h-10 flex items-center text-sm font-semibold text-slate-700">{money(normalized.cost)}</div>
                <button type="button" disabled={form.items.length === 1} onClick={() => setForm({ ...form, items: form.items.filter((_, lineIndex) => lineIndex !== index) })} className="h-10 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30" title="Remove usage line"><Trash2 className="h-4 w-4" /></button>
              </div>;
            })}
          </div>
          <button type="button" onClick={() => setForm({ ...form, items: [...form.items, { itemId: '', quantity: '', inputUnit: 'KG' }] })} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-amber-700"><Plus className="h-4 w-4" /> Add another item</button>
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><p className="text-lg font-bold text-slate-900">Estimated usage cost: {money(totalCost)}</p><button type="submit" disabled={saving || validLines.length === 0 || shortages.length > 0} className="px-5 py-2.5 bg-slate-900 text-white rounded-lg font-semibold disabled:opacity-50">{saving ? 'Recording...' : 'Record usage & deduct stock'}</button></div>
          <p className="text-xs text-slate-500 mt-2">kg/g and L/ml convert automatically. Packets and pieces cannot be interchanged.</p>
        </form>
      )}

      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 mb-4"><div><h2 className="font-semibold text-slate-900">Consumption history</h2><p className="text-xs text-slate-500 mt-1">Grouped manual usage records and their reversal movements.</p></div><select aria-label="Filter usage by item" value={filterItem} onChange={(event) => { setFilterItem(event.target.value); setPage(1); }} className="border border-slate-300 rounded-lg px-3 py-2 text-sm"><option value="">All inventory items</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-2 mb-4">
          <select aria-label="Filter usage by status" value={filterStatus} onChange={(event) => { setFilterStatus(event.target.value); setPage(1); }} className="border border-slate-300 rounded-lg px-3 py-2 text-sm"><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="CANCELLED">Cancelled</option></select>
          <label className="relative"><CalendarDays className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input aria-label="Usage start date" type="date" value={startDate} max={endDate || undefined} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} className="w-full border border-slate-300 rounded-lg pl-9 pr-2 py-2 text-sm" /></label>
          <label className="relative"><CalendarDays className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input aria-label="Usage end date" type="date" min={startDate || undefined} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} className="w-full border border-slate-300 rounded-lg pl-9 pr-2 py-2 text-sm" /></label>
          <button type="button" onClick={clearFilters} disabled={!filterItem && !filterStatus && !startDate && !endDate} className="inline-flex items-center justify-center gap-1 px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:opacity-50"><X className="h-3.5 w-3.5" /> Clear filters</button>
        </div>

        {loading ? <p className="py-12 text-center text-sm text-slate-500">Loading usage records...</p> : records.length === 0 ? (
          <div className="py-12 text-center"><PackageMinus className="mx-auto h-8 w-8 text-slate-300 mb-3" /><p className="text-sm font-semibold text-slate-700">No usage records found</p><p className="text-sm text-slate-500 mt-1">Record manual consumption or clear the filters to see more history.</p></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[850px]"><thead className="text-left text-slate-500 border-b"><tr><th className="py-2 pr-4">Date / reference</th><th className="pr-4">Items consumed</th><th className="pr-4 text-right">Usage cost</th><th className="pr-4">Status</th><th className="pr-4">Notes</th><th className="text-right">Actions</th></tr></thead><tbody>{records.map((record) => (
            <tr key={record.id} className="border-b last:border-0 align-top"><td className="py-3 pr-4"><p className="font-semibold text-slate-900">{formatDate(record.date)}</p><p className="text-xs text-slate-500 mt-1">{record.reference || record.id.slice(0, 8)}</p></td><td className="py-3 pr-4"><p>{record.items.map((item) => `${formatQty(item.quantity)} ${item.unit} ${item.name}`).join(', ')}</p><p className="text-xs text-slate-500 mt-1">{record.items.length} inventory items</p></td><td className="py-3 pr-4 text-right font-semibold whitespace-nowrap">{money(record.totalCost)}</td><td className="py-3 pr-4"><span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${record.status === 'CANCELLED' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>{record.status}</span></td><td className="py-3 pr-4 max-w-[200px] truncate" title={record.notes || ''}>{record.notes || '-'}</td><td className="py-3"><div className="flex justify-end gap-1"><button type="button" onClick={() => void openDetails(record)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg" title="View usage details"><Eye className="h-4 w-4" /></button>{record.status === 'ACTIVE' && <button type="button" onClick={() => openCancel(record)} className="p-2 text-red-700 hover:bg-red-50 rounded-lg" title="Cancel usage"><Ban className="h-4 w-4" /></button>}</div></td></tr>
          ))}</tbody></table></div>
        )}
        <div className="flex items-center justify-between mt-4"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} className="inline-flex items-center gap-1 text-sm disabled:text-slate-300"><ChevronLeft className="h-4 w-4" /> Previous</button><span className="text-sm text-slate-500">Page {page} of {totalPages}</span><button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)} className="inline-flex items-center gap-1 text-sm disabled:text-slate-300">Next <ChevronRight className="h-4 w-4" /></button></div>
      </section>

      {detail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="usage-detail-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !detailLoading) setDetail(null); }}>
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-5">
            <div className="flex items-start justify-between gap-3 mb-4"><div><h2 id="usage-detail-title" className="text-lg font-bold text-slate-900">Usage details</h2><p className="text-xs text-slate-500 mt-1">{detail.id}</p></div><button type="button" onClick={() => setDetail(null)} className="p-2 hover:bg-slate-100 rounded-lg" aria-label="Close usage details"><X className="h-5 w-5" /></button></div>
            {detailLoading ? <p className="text-sm text-slate-500 py-8 text-center">Loading usage details...</p> : <>
              <div className="grid sm:grid-cols-3 gap-3 mb-4 text-sm"><div className="bg-slate-50 rounded-lg p-3"><p className="text-xs text-slate-500">Recorded cost</p><p className="font-bold text-lg mt-1">{money(detail.totalCost)}</p></div><div className="bg-slate-50 rounded-lg p-3"><p className="text-xs text-slate-500">Status</p><p className="font-semibold mt-1">{detail.status}</p></div><div className="bg-slate-50 rounded-lg p-3"><p className="text-xs text-slate-500">Recorded by</p><p className="font-semibold mt-1">{detail.createdByUser?.name || detail.createdByUser?.username || '-'}</p></div></div>
              <h3 className="font-semibold text-slate-900 mb-2">Consumed items</h3><div className="overflow-x-auto"><table className="w-full text-sm mb-4"><thead className="text-left text-slate-500 border-b"><tr><th className="py-2">Item</th><th className="py-2 text-right">Quantity</th><th className="py-2 text-right">Unit cost</th><th className="py-2 text-right">Total</th></tr></thead><tbody>{detail.items.map((item) => <tr key={item.id} className="border-b"><td className="py-2">{item.name}</td><td className="py-2 text-right">{formatQty(item.quantity)} {item.unit}</td><td className="py-2 text-right">{money(item.unitCost)}</td><td className="py-2 text-right font-semibold">{money(item.totalCost)}</td></tr>)}</tbody></table></div>
              <h3 className="font-semibold text-slate-900 mb-2">Stock movements</h3><ul className="space-y-2">{detail.movements.map((movement) => <li key={movement.id} className="flex flex-wrap justify-between gap-2 bg-slate-50 rounded-lg px-3 py-2 text-sm"><span>{movement.type} · {movement.item?.name || movement.itemId} · {formatQty(movement.quantity)} {movement.item?.unit}</span><span className="text-slate-500">{movement.status} · {money(Number(movement.totalCost) || 0)}</span></li>)}</ul>
              <div className="mt-4 border-t border-slate-200 pt-4 grid sm:grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-slate-500">Reference</p><p className="font-medium mt-1">{detail.reference || '-'}</p></div><div><p className="text-xs text-slate-500">Notes</p><p className="font-medium mt-1">{detail.notes || '-'}</p></div><div><p className="text-xs text-slate-500">Cancelled by / on</p><p className="font-medium mt-1">{detail.cancelledAt ? `${detail.cancelledByUser?.name || detail.cancelledByUser?.username || '-'} · ${new Date(detail.cancelledAt).toLocaleString()}` : '-'}</p></div><div><p className="text-xs text-slate-500">Cancellation reason</p><p className="font-medium mt-1">{detail.cancellationReason || '-'}</p></div></div>
            </>}
          </div>
        </div>
      )}

      {cancelTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="cancel-usage-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setCancelTarget(null); }}>
          <form onSubmit={submitCancellation} className="bg-white rounded-xl shadow-xl max-w-md w-full p-5"><div className="flex items-start justify-between gap-3 mb-3"><div><h2 id="cancel-usage-title" className="text-lg font-bold text-slate-900">Reverse usage record?</h2><p className="text-sm text-slate-500 mt-1">{cancelTarget.items.length} items · {money(cancelTarget.totalCost)}</p></div><button type="button" onClick={() => setCancelTarget(null)} disabled={saving} className="p-2 hover:bg-slate-100 rounded-lg" aria-label="Close cancellation"><X className="h-5 w-5" /></button></div><p className="text-sm text-slate-600 mb-4">All consumed quantities will be restored and linked reversal movements will be created. The original record remains in history.</p><label className={labelClass}>Reason</label><textarea required minLength={3} maxLength={500} rows={3} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} className={inputClass} placeholder="Why is this usage being reversed?" /><div className="flex justify-end gap-2 mt-4"><button type="button" disabled={saving} onClick={() => setCancelTarget(null)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm">Keep record</button><button type="submit" disabled={saving || cancelReason.trim().length < 3} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">{saving ? 'Reversing...' : 'Reverse usage'}</button></div></form>
        </div>
      )}
    </div>
  );
};
