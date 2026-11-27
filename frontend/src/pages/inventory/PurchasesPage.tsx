import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Ban,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import {
  cancelPurchase,
  createPurchase,
  getPurchase,
  getPurchases,
  updatePurchase,
} from '../../api/purchases';
import { useAuth } from '../../context/AuthContext';
import { InventoryItem, ItemUnit, Purchase, Supplier } from '../../types';
import { formatMoney, formatQty, todayIso } from '../../utils/format';

type PurchaseForm = {
  itemId: string;
  quantity: string;
  unitCost: string;
  inputUnit: ItemUnit;
  supplierId: string;
  reference: string;
  remarks: string;
  date: string;
};

const emptyForm = (): PurchaseForm => ({
  itemId: '',
  quantity: '',
  unitCost: '',
  inputUnit: 'KG',
  supplierId: '',
  reference: '',
  remarks: '',
  date: todayIso(),
});

const labelClass = 'block text-sm font-semibold mb-1 text-slate-700';
const inputClass = 'w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100';

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

export const PurchasesPage: React.FC = () => {
  const { shop } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [purchases, setPurchases] = React.useState<Purchase[]>([]);
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [form, setForm] = React.useState<PurchaseForm>(emptyForm);
  const [formOpen, setFormOpen] = React.useState(window.location.pathname === '/purchases/new');
  const [editing, setEditing] = React.useState<Purchase | null>(null);
  const [requestKey, setRequestKey] = React.useState(() => crypto.randomUUID());
  const [detail, setDetail] = React.useState<Purchase | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<Purchase | null>(null);
  const [cancelReason, setCancelReason] = React.useState('');
  const [cancelKey, setCancelKey] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [summary, setSummary] = React.useState({ activePurchaseCount: 0, activePurchaseValue: 0 });
  const [filterItem, setFilterItem] = React.useState('');
  const [filterSupplier, setFilterSupplier] = React.useState('');
  const [filterStatus, setFilterStatus] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [purchaseResponse, itemResponse, supplierResponse] = await Promise.all([
        getPurchases({
          page,
          limit: 15,
          ...(filterItem ? { itemId: filterItem } : {}),
          ...(filterSupplier ? { supplierId: filterSupplier } : {}),
          ...(filterStatus ? { status: filterStatus as 'ACTIVE' | 'CANCELLED' } : {}),
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
        }),
        fetchItems(),
        fetchSuppliers(),
      ]);
      setPurchases(purchaseResponse.purchases || []);
      setTotal(purchaseResponse.pagination.total);
      setTotalPages(Math.max(1, purchaseResponse.pagination.totalPages));
      setSummary(purchaseResponse.summary);
      setItems(itemResponse);
      setSuppliers(supplierResponse);
      if (page > 1 && purchaseResponse.purchases.length === 0) setPage((current) => current - 1);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filterItem, filterSupplier, filterStatus, startDate, endDate]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    setFormOpen(location.pathname === '/purchases/new');
  }, [location.pathname]);

  const selectedItem = items.find((item) => item.id === form.itemId);
  const quantity = Number(form.quantity);
  const unitCost = Number(form.unitCost);
  const normalizedQuantity = selectedItem
    ? quantity * conversionFactor(form.inputUnit, selectedItem.unit)
    : quantity;
  const stockAfter = selectedItem && Number.isFinite(normalizedQuantity)
    ? Number(selectedItem.currentStock) + normalizedQuantity - (editing ? Number(editing.quantity) : 0)
    : null;
  const purchaseTotal = Number.isFinite(quantity * unitCost) ? quantity * unitCost : 0;
  const money = (value: number | null | undefined) => formatMoney(Number(value) || 0, shop?.currency || 'INR');

  const resetForm = () => {
    setEditing(null);
    setForm(emptyForm());
    setRequestKey(crypto.randomUUID());
  };

  const openCreate = () => {
    resetForm();
    setFormOpen(true);
    setError('');
    setSuccess('');
    navigate('/purchases/new');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const selectItem = (itemId: string) => {
    const item = items.find((candidate) => candidate.id === itemId);
    setForm((current) => ({
      ...current,
      itemId,
      inputUnit: item?.unit || current.inputUnit,
      unitCost: editing ? current.unitCost : item ? String(item.unitCost) : '',
    }));
  };

  const changeInputUnit = (inputUnit: ItemUnit) => {
    if (!selectedItem || inputUnit === form.inputUnit) {
      setForm((current) => ({ ...current, inputUnit }));
      return;
    }
    const previousFactor = conversionFactor(form.inputUnit, selectedItem.unit);
    const nextFactor = conversionFactor(inputUnit, selectedItem.unit);
    const currentCost = Number(form.unitCost);
    const nextCost = Number.isFinite(currentCost) && Number.isFinite(previousFactor * nextFactor)
      ? currentCost * nextFactor / previousFactor
      : currentCost;
    setForm((current) => ({ ...current, inputUnit, unitCost: String(Number(nextCost.toFixed(6))) }));
  };

  const startEdit = (purchase: Purchase) => {
    setEditing(purchase);
    setFormOpen(true);
    setRequestKey(crypto.randomUUID());
    setError('');
    setSuccess('');
    setForm({
      itemId: purchase.itemId,
      quantity: String(purchase.inputQuantity ?? purchase.quantity),
      unitCost: String(purchase.inputUnitCost ?? purchase.unitCost ?? ''),
      inputUnit: purchase.inputUnit || purchase.item?.unit || 'KG',
      supplierId: purchase.supplierId || '',
      reference: purchase.reference || '',
      remarks: purchase.remarks || '',
      date: purchase.date.slice(0, 10),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!selectedItem) {
      setError('Choose an inventory item.');
      return;
    }
    if (!compatibleUnits(selectedItem.unit).includes(form.inputUnit)) {
      setError(`${form.inputUnit} cannot be converted to ${selectedItem.unit}.`);
      return;
    }
    if (!editing && !selectedItem.isActive) {
      setError('Archived items cannot receive new purchases. Restore the item first.');
      return;
    }
    if (!(quantity > 0) || !(unitCost > 0)) {
      setError('Quantity and unit cost must be greater than zero.');
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      setError('Start date must be on or before end date.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        quantity,
        unitCost,
        inputUnit: form.inputUnit,
        supplierId: form.supplierId || null,
        reference: form.reference.trim() || null,
        remarks: form.remarks.trim() || null,
        date: form.date,
        idempotencyKey: requestKey,
      };
      const result = editing
        ? await updatePurchase(editing.id, payload)
        : await createPurchase({ ...payload, itemId: form.itemId });
      setSuccess(result.isDuplicate ? 'This request was already applied; no stock was duplicated.' : result.message);
      resetForm();
      setPage(1);
      if (filterStatus === 'CANCELLED') setFilterStatus('');
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openCancel = (purchase: Purchase) => {
    setCancelTarget(purchase);
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
      const result = await cancelPurchase(cancelTarget.id, cancelReason.trim(), cancelKey);
      setSuccess(result.isDuplicate ? 'This cancellation was already applied.' : result.message);
      setCancelTarget(null);
      setCancelReason('');
      if (editing?.id === cancelTarget.id) resetForm();
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openDetails = async (purchase: Purchase) => {
    setDetailLoading(true);
    setDetail(purchase);
    setError('');
    try {
      setDetail(await getPurchase(purchase.id));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const clearFilters = () => {
    setFilterItem('');
    setFilterSupplier('');
    setFilterStatus('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const canModify = (purchase: Purchase) =>
    purchase.status !== 'CANCELLED' && purchase.reference !== 'OPENING-STOCK';

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Purchases</h1>
          <p className="text-sm text-slate-500">Record deliveries, review history, and keep stock and costs audit-safe.</p>
        </div>
        <div className="flex gap-2">
          {formOpen && <button type="button" onClick={() => { setFormOpen(false); resetForm(); navigate('/purchases'); }} className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold">View history</button>}
          {!formOpen && <button type="button" onClick={openCreate} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold"><Plus className="h-4 w-4" /> Record purchase</button>}
        </div>
      </div>

      {error && <div role="alert" className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      {success && <div role="status" className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">{success}</div>}

      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Matching records</p><p className="text-2xl font-bold text-slate-900 mt-1">{total}</p></div>
        <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Active purchases</p><p className="text-2xl font-bold text-slate-900 mt-1">{summary.activePurchaseCount}</p></div>
        <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Active purchase value</p><p className="text-2xl font-bold text-slate-900 mt-1">{money(summary.activePurchaseValue)}</p><p className="text-xs text-slate-500 mt-1">Weighted-average costing</p></div>
      </div>

      {formOpen && (
        <form onSubmit={submit} className="bg-white border border-slate-200 rounded-xl p-5 mb-6 lg:sticky lg:top-4 lg:z-10">
          <div className="flex items-center justify-between mb-4">
            <div><h2 className="font-semibold text-slate-900">{editing ? `Edit purchase ${editing.id.slice(0, 8)}` : 'Record a purchase'}</h2><p className="text-xs text-slate-500 mt-1">{editing ? 'The original is cancelled and a linked reversal/replacement pair preserves the audit trail.' : 'Stock and weighted-average cost update atomically.'}</p></div>
            {editing && <button type="button" onClick={resetForm} className="text-sm text-slate-500">Cancel edit</button>}
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="xl:col-span-2">
              <label className={labelClass}>Inventory item</label>
              <select required disabled={Boolean(editing)} value={form.itemId} onChange={(event) => selectItem(event.target.value)} className={inputClass}>
                <option value="">Choose an item</option>
                {items.map((item) => <option key={item.id} value={item.id} disabled={!item.isActive && !editing}>{item.name} — {formatQty(item.currentStock)} {item.unit}{!item.isActive ? ' (archived)' : ''}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Supplier</label><select value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })} className={inputClass}><option value="">No supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}{!supplier.isActive ? ' (inactive)' : ''}</option>)}</select></div>
            <div><label className={labelClass}>Purchase date</label><input required type="date" max={todayIso()} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Input unit</label><select value={form.inputUnit} onChange={(event) => changeInputUnit(event.target.value as ItemUnit)} className={inputClass}>{compatibleUnits(selectedItem?.unit || form.inputUnit).map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></div>
            <div><label className={labelClass}>Quantity ({form.inputUnit})</label><input required type="number" min="0.001" step="0.001" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Unit cost (per {form.inputUnit})</label><input required type="number" min="0.0001" step="0.0001" value={form.unitCost} onChange={(event) => setForm({ ...form, unitCost: event.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Invoice / reference</label><input maxLength={100} value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} className={inputClass} placeholder="Optional" /></div>
            <div className="xl:col-span-3"><label className={labelClass}>Remarks</label><input maxLength={500} value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} className={inputClass} placeholder="Optional delivery notes" /></div>
          </div>
          {selectedItem && form.quantity && (
            <div className="mt-4 grid sm:grid-cols-3 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
              <p className="text-slate-600">Normalized quantity: <strong className="text-slate-900">{formatQty(normalizedQuantity)} {selectedItem.unit}</strong></p>
              <p className="text-slate-600">Purchase total: <strong className="text-slate-900">{money(purchaseTotal)}</strong></p>
              <p className="text-slate-600">Stock after {editing ? 'edit' : 'purchase'}: <strong className={stockAfter !== null && stockAfter < 0 ? 'text-red-700' : 'text-slate-900'}>{stockAfter === null ? '-' : `${formatQty(stockAfter)} ${selectedItem.unit}`}</strong></p>
            </div>
          )}
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <button type="submit" disabled={saving || !form.itemId || !form.quantity || !form.unitCost || (stockAfter !== null && stockAfter < 0)} className="px-5 py-2.5 bg-slate-900 text-white rounded-lg font-semibold disabled:opacity-50">{saving ? 'Saving...' : editing ? 'Save purchase correction' : 'Record purchase'}</button>
            <p className="text-xs text-slate-500">kg/g and L/ml convert automatically. Packets and pieces cannot be interchanged.</p>
          </div>
        </form>
      )}

      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 mb-4">
          <div><h2 className="font-semibold text-slate-900">Purchase history</h2><p className="text-xs text-slate-500 mt-1">Cancelled purchases and their reversals remain visible for audit.</p></div>
          <div className="relative w-full xl:w-64"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><select aria-label="Filter purchases by item" value={filterItem} onChange={(event) => { setFilterItem(event.target.value); setPage(1); }} className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm"><option value="">All items</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-2 mb-4">
          <select aria-label="Filter purchases by supplier" value={filterSupplier} onChange={(event) => { setFilterSupplier(event.target.value); setPage(1); }} className="border border-slate-300 rounded-lg px-3 py-2 text-sm"><option value="">All suppliers</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select>
          <select aria-label="Filter purchases by status" value={filterStatus} onChange={(event) => { setFilterStatus(event.target.value); setPage(1); }} className="border border-slate-300 rounded-lg px-3 py-2 text-sm"><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="CANCELLED">Cancelled</option></select>
          <label className="relative"><CalendarDays className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input aria-label="Purchase start date" type="date" value={startDate} max={endDate || undefined} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} className="w-full border border-slate-300 rounded-lg pl-9 pr-2 py-2 text-sm" /></label>
          <label className="relative"><CalendarDays className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input aria-label="Purchase end date" type="date" value={endDate} min={startDate || undefined} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} className="w-full border border-slate-300 rounded-lg pl-9 pr-2 py-2 text-sm" /></label>
          <button type="button" onClick={clearFilters} disabled={!filterItem && !filterSupplier && !filterStatus && !startDate && !endDate} className="inline-flex items-center justify-center gap-1 px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:opacity-50"><X className="h-3.5 w-3.5" /> Clear filters</button>
        </div>

        {loading ? <p className="py-12 text-center text-sm text-slate-500">Loading purchases...</p> : purchases.length === 0 ? (
          <div className="py-12 text-center"><ShoppingCart className="mx-auto h-8 w-8 text-slate-300 mb-3" /><p className="text-sm font-semibold text-slate-700">No purchases found</p><p className="text-sm text-slate-500 mt-1">Record a delivery or clear the filters to see more history.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[980px]">
              <thead className="text-left text-slate-500 border-b"><tr><th className="py-2 pr-4">Date / item</th><th className="pr-4">Supplier</th><th className="pr-4">Quantity</th><th className="pr-4">Unit cost</th><th className="pr-4 text-right">Total</th><th className="pr-4">Status</th><th className="pr-4">Reference</th><th className="text-right">Actions</th></tr></thead>
              <tbody>{purchases.map((purchase) => (
                <tr key={purchase.id} className="border-b last:border-0 align-top">
                  <td className="py-3 pr-4"><p className="font-semibold text-slate-900">{purchase.item?.name || 'Unknown item'}</p><p className="text-xs text-slate-500 mt-1">{formatDate(purchase.date)} · {purchase.id.slice(0, 8)}</p></td>
                  <td className="py-3 pr-4">{purchase.supplier?.name || '-'}</td>
                  <td className="py-3 pr-4 whitespace-nowrap">{formatQty(purchase.inputQuantity ?? purchase.quantity)} {purchase.inputUnit || purchase.item?.unit}</td>
                  <td className="py-3 pr-4 whitespace-nowrap">{money(purchase.inputUnitCost ?? purchase.unitCost)} / {purchase.inputUnit || purchase.item?.unit}</td>
                  <td className="py-3 pr-4 text-right font-semibold whitespace-nowrap">{money(purchase.totalCost)}</td>
                  <td className="py-3 pr-4"><span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${purchase.status === 'CANCELLED' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>{purchase.status || 'ACTIVE'}</span>{purchase.reference === 'OPENING-STOCK' && <p className="text-[11px] text-slate-500 mt-1">Opening stock</p>}</td>
                  <td className="py-3 pr-4 max-w-[180px] truncate" title={purchase.reference || purchase.remarks || ''}>{purchase.reference || purchase.remarks || '-'}</td>
                  <td className="py-3"><div className="flex justify-end gap-1"><button type="button" onClick={() => void openDetails(purchase)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg" title="View audit details"><Eye className="h-4 w-4" /></button>{canModify(purchase) && <><button type="button" onClick={() => startEdit(purchase)} className="p-2 text-amber-700 hover:bg-amber-50 rounded-lg" title="Edit purchase"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => openCancel(purchase)} className="p-2 text-red-700 hover:bg-red-50 rounded-lg" title="Cancel purchase"><Ban className="h-4 w-4" /></button></>}</div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between mt-4"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} className="inline-flex items-center gap-1 text-sm disabled:text-slate-300"><ChevronLeft className="h-4 w-4" /> Previous</button><span className="text-sm text-slate-500">Page {page} of {totalPages}</span><button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)} className="inline-flex items-center gap-1 text-sm disabled:text-slate-300">Next <ChevronRight className="h-4 w-4" /></button></div>
      </section>

      {detail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="purchase-detail-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !detailLoading) setDetail(null); }}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5">
            <div className="flex items-start justify-between gap-3 mb-4"><div><h2 id="purchase-detail-title" className="text-lg font-bold text-slate-900">Purchase details</h2><p className="text-xs text-slate-500 mt-1">{detail.id}</p></div><button type="button" onClick={() => setDetail(null)} className="p-2 hover:bg-slate-100 rounded-lg" aria-label="Close details"><X className="h-5 w-5" /></button></div>
            {detailLoading ? <p className="text-sm text-slate-500 py-8 text-center">Loading audit details...</p> : <>
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div className="bg-slate-50 rounded-lg p-3"><p className="text-xs text-slate-500">Item</p><p className="font-semibold mt-1">{detail.item?.name}</p><p className="text-xs text-slate-500 mt-1">{formatQty(detail.quantity)} {detail.item?.unit} at {money(detail.unitCost)}</p></div>
                <div className="bg-slate-50 rounded-lg p-3"><p className="text-xs text-slate-500">Purchase total</p><p className="font-semibold mt-1">{money(detail.totalCost)}</p><p className="text-xs text-slate-500 mt-1">{detail.supplier?.name || 'No supplier'}</p></div>
                <div><p className="text-xs text-slate-500">Recorded by</p><p className="font-medium mt-1">{detail.createdByUser?.name || detail.createdByUser?.username || '-'}</p></div>
                <div><p className="text-xs text-slate-500">Recorded on</p><p className="font-medium mt-1">{new Date(detail.createdAt).toLocaleString()}</p></div>
                <div><p className="text-xs text-slate-500">Reference</p><p className="font-medium mt-1">{detail.reference || '-'}</p></div>
                <div><p className="text-xs text-slate-500">Remarks</p><p className="font-medium mt-1">{detail.remarks || '-'}</p></div>
              </div>
              <div className="mt-4 border-t border-slate-200 pt-4"><h3 className="font-semibold text-slate-900 mb-2">Audit trail</h3><dl className="grid sm:grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-slate-500">Status</dt><dd className="font-medium mt-1">{detail.status || 'ACTIVE'}</dd></div>
                <div><dt className="text-xs text-slate-500">Audit group</dt><dd className="font-mono text-xs mt-1 break-all">{detail.auditGroupId || '-'}</dd></div>
                <div><dt className="text-xs text-slate-500">Reversal of</dt><dd className="font-mono text-xs mt-1 break-all">{detail.reversalOfId || detail.reversalOf?.id || '-'}</dd></div>
                <div><dt className="text-xs text-slate-500">Linked reversal</dt><dd className="font-mono text-xs mt-1 break-all">{detail.reversal?.id || '-'}</dd></div>
                <div><dt className="text-xs text-slate-500">Cancelled by</dt><dd className="font-medium mt-1">{detail.cancelledByUser?.name || detail.cancelledByUser?.username || '-'}</dd></div>
                <div><dt className="text-xs text-slate-500">Cancelled on</dt><dd className="font-medium mt-1">{detail.cancelledAt ? new Date(detail.cancelledAt).toLocaleString() : '-'}</dd></div>
                <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Cancellation reason</dt><dd className="font-medium mt-1">{detail.cancellationReason || '-'}</dd></div>
              </dl></div>
            </>}
          </div>
        </div>
      )}

      {cancelTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="cancel-purchase-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setCancelTarget(null); }}>
          <form onSubmit={submitCancellation} className="bg-white rounded-xl shadow-xl max-w-md w-full p-5">
            <div className="flex items-start justify-between gap-3 mb-3"><div><h2 id="cancel-purchase-title" className="text-lg font-bold text-slate-900">Cancel purchase?</h2><p className="text-sm text-slate-500 mt-1">{cancelTarget.item?.name} · {formatQty(cancelTarget.quantity)} {cancelTarget.item?.unit}</p></div><button type="button" onClick={() => setCancelTarget(null)} disabled={saving} className="p-2 hover:bg-slate-100 rounded-lg" aria-label="Close cancellation"><X className="h-5 w-5" /></button></div>
            <p className="text-sm text-slate-600 mb-4">The purchase will be marked cancelled, its stock will be reversed, and weighted-average cost will be recalculated. Cancellation is blocked if the stock has already been consumed.</p>
            <label className={labelClass}>Reason</label><textarea required minLength={3} maxLength={500} rows={3} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} className={inputClass} placeholder="Why is this purchase being cancelled?" />
            <div className="flex justify-end gap-2 mt-4"><button type="button" disabled={saving} onClick={() => setCancelTarget(null)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm">Keep purchase</button><button type="submit" disabled={saving || cancelReason.trim().length < 3} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">{saving ? 'Cancelling...' : 'Cancel purchase'}</button></div>
          </form>
        </div>
      )}
    </div>
  );
};

async function fetchItems(): Promise<InventoryItem[]> {
  const response = await api.get('/items');
  return response.data.items || [];
}

async function fetchSuppliers(): Promise<Supplier[]> {
  const response = await api.get('/suppliers');
  return response.data.suppliers || [];
}
