import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Ban, CalendarDays, ChevronLeft, ChevronRight, Eye, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { api } from '../../api/client';
import { cancelSale, createSale, getSale, getSales } from '../../api/sales';
import { getMenuItems } from '../../api/menu';
import { useAuth } from '../../context/AuthContext';
import { InventoryItem, MenuItem, Sale, TransactionStatus } from '../../types';
import { formatMoney, formatQty, todayIso } from '../../utils/format';

type SaleLine = { menuItemId: string; quantity: string };

const labelClass = 'block text-sm font-semibold mb-1 text-slate-700';
const inputClass = 'w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100';
const emptyForm = () => ({ reference: '', notes: '', date: todayIso(), items: [{ menuItemId: '', quantity: '1' }] as SaleLine[] });

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
}

export const SalesPage: React.FC = () => {
  const { shop } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sales, setSales] = React.useState<Sale[]>([]);
  const [menuItems, setMenuItems] = React.useState<MenuItem[]>([]);
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [form, setForm] = React.useState(emptyForm);
  const [formOpen, setFormOpen] = React.useState(location.pathname === '/sales/new');
  const [requestKey, setRequestKey] = React.useState(() => crypto.randomUUID());
  const [detail, setDetail] = React.useState<Sale | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<Sale | null>(null);
  const [cancelReason, setCancelReason] = React.useState('');
  const [cancelKey, setCancelKey] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [summary, setSummary] = React.useState({ activeSaleCount: 0, revenue: 0, itemsSold: 0 });
  const [filterMenu, setFilterMenu] = React.useState('');
  const [filterStatus, setFilterStatus] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const money = (value: number) => formatMoney(Number(value) || 0, shop?.currency || 'INR');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [salesResponse, menuResponse, itemResponse] = await Promise.all([
        getSales({
          page,
          limit: 15,
          ...(filterMenu ? { menuItemId: filterMenu } : {}),
          ...(filterStatus ? { status: filterStatus as TransactionStatus } : {}),
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
        }),
        getMenuItems({ limit: 100 }),
        api.get('/items'),
      ]);
      setSales(salesResponse.sales || []);
      setTotal(salesResponse.pagination.total);
      setTotalPages(Math.max(1, salesResponse.pagination.totalPages));
      setSummary(salesResponse.summary);
      setMenuItems(menuResponse.menuItems || []);
      setItems(itemResponse.data.items || []);
      if (page > 1 && salesResponse.sales.length === 0) setPage((current) => current - 1);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filterMenu, filterStatus, startDate, endDate]);

  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => { setFormOpen(location.pathname === '/sales/new'); }, [location.pathname]);

  const activeMenus = menuItems.filter((menuItem) => menuItem.isActive);
  const menuById = new Map(menuItems.map((menuItem) => [menuItem.id, menuItem]));
  const itemById = new Map(items.map((item) => [item.id, item]));
  const validLines = form.items.filter((line) => line.menuItemId && Number(line.quantity) > 0);
  const saleTotal = validLines.reduce((sum, line) => sum + Number(line.quantity) * Number(menuById.get(line.menuItemId)?.sellingPrice || 0), 0);
  const ingredientUsage = new Map<string, number>();
  for (const line of validLines) {
    for (const recipe of menuById.get(line.menuItemId)?.recipeItems || []) {
      ingredientUsage.set(recipe.itemId, (ingredientUsage.get(recipe.itemId) || 0) + recipe.quantity * Number(line.quantity));
    }
  }
  const shortages = [...ingredientUsage.entries()].filter(([itemId, quantity]) => quantity > Number(itemById.get(itemId)?.currentStock || 0));
  const hasDuplicateMenus = new Set(form.items.map((line) => line.menuItemId).filter(Boolean)).size !== form.items.filter((line) => line.menuItemId).length;

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
    navigate('/sales/new');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateLine = (index: number, patch: Partial<SaleLine>) => {
    setForm((current) => ({ ...current, items: current.items.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line) }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (hasDuplicateMenus || validLines.length !== form.items.length || validLines.some((line) => !Number.isInteger(Number(line.quantity)))) {
      setError('Choose each menu item once and enter a whole-number quantity greater than zero.');
      return;
    }
    if (shortages.length > 0) {
      setError(`Insufficient stock: ${shortages.map(([itemId]) => itemById.get(itemId)?.name || itemId).join(', ')}.`);
      return;
    }
    setSaving(true);
    try {
      const result = await createSale({
        items: validLines.map((line) => ({ menuItemId: line.menuItemId, quantity: Number(line.quantity) })),
        reference: form.reference.trim() || null,
        notes: form.notes.trim() || null,
        date: form.date,
        idempotencyKey: requestKey,
      });
      setSuccess(result.isDuplicate ? 'This sale was already recorded; stock was not deducted twice.' : result.message);
      resetForm();
      setPage(1);
      if (filterStatus === 'CANCELLED') setFilterStatus('');
      navigate('/sales');
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openCancel = (sale: Sale) => {
    setCancelTarget(sale);
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
      const result = await cancelSale(cancelTarget.id, cancelReason.trim(), cancelKey);
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

  const openDetails = async (sale: Sale) => {
    setDetail(sale);
    setDetailLoading(true);
    setError('');
    try { setDetail(await getSale(sale.id)); } catch (err: any) { setError(err.message); } finally { setDetailLoading(false); }
  };

  const clearFilters = () => {
    setFilterMenu('');
    setFilterStatus('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div><h1 className="text-2xl font-bold text-slate-900">Sales</h1><p className="text-sm text-slate-500">Record counter sales; linked recipe ingredients are deducted automatically.</p></div>
        <div className="flex gap-2">{formOpen && <button type="button" onClick={() => { resetForm(); navigate('/sales'); }} className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold">View history</button>}{!formOpen && <button type="button" onClick={openCreate} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold"><Plus className="h-4 w-4" /> Record sale</button>}</div>
      </div>

      {error && <div role="alert" className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      {success && <div role="status" className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">{success}</div>}

      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-white border rounded-xl p-4"><p className="text-xs font-semibold text-slate-500 uppercase">Matching sales</p><p className="text-2xl font-bold mt-1">{total}</p></div>
        <div className="bg-white border rounded-xl p-4"><p className="text-xs font-semibold text-slate-500 uppercase">Active sales / items</p><p className="text-2xl font-bold mt-1">{summary.activeSaleCount} <span className="text-base font-normal text-slate-500">/ {summary.itemsSold}</span></p></div>
        <div className="bg-white border rounded-xl p-4"><p className="text-xs font-semibold text-slate-500 uppercase">Recorded revenue</p><p className="text-2xl font-bold mt-1">{money(summary.revenue)}</p><p className="text-xs text-slate-500 mt-1">Excludes cancelled sales</p></div>
      </div>

      {formOpen && (
        <form onSubmit={submit} className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
          <div className="mb-4"><h2 className="font-semibold text-slate-900">Record a sale</h2><p className="text-xs text-slate-500 mt-1">Prices come from the saved menu. Stock and financial records are written atomically.</p></div>
          <div className="grid md:grid-cols-3 gap-3 mb-4">
            <div><label className={labelClass}>Sale date</label><input required type="date" max={todayIso()} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Order / reference</label><input maxLength={100} value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} className={inputClass} placeholder="Optional" /></div>
            <div><label className={labelClass}>Notes</label><input maxLength={500} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={inputClass} placeholder="Optional" /></div>
          </div>
          <div className="space-y-2">
            <div className="hidden sm:grid grid-cols-[1fr_140px_120px_36px] gap-2 text-xs font-semibold text-slate-500"><span>Menu item</span><span>Quantity</span><span>Line total</span><span /></div>
            {form.items.map((line, index) => {
              const menuItem = menuById.get(line.menuItemId);
              const quantity = Number(line.quantity);
              return (
                <div key={index} className="grid sm:grid-cols-[1fr_140px_120px_36px] gap-2 items-end">
                  <select required value={line.menuItemId} onChange={(event) => updateLine(index, { menuItemId: event.target.value })} className={inputClass}><option value="">Choose a menu item</option>{menuItems.map((menu) => <option key={menu.id} value={menu.id} disabled={!menu.isActive || (form.items.some((other, otherIndex) => otherIndex !== index && other.menuItemId === menu.id))}>{menu.name}{!menu.isActive ? ' (unavailable)' : ''}</option>)}</select>
                  <input required aria-label={`Quantity for sale line ${index + 1}`} type="number" min="1" step="1" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} className={inputClass} />
                  <div className="h-10 flex items-center text-sm font-semibold text-slate-700">{money(menuItem ? menuItem.sellingPrice * quantity : 0)}</div>
                  <button type="button" disabled={form.items.length === 1} onClick={() => setForm({ ...form, items: form.items.filter((_, lineIndex) => lineIndex !== index) })} className="h-10 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30" title="Remove sale line"><Trash2 className="h-4 w-4" /></button>
                </div>
              );
            })}
          </div>
          <button type="button" onClick={() => setForm({ ...form, items: [...form.items, { menuItemId: '', quantity: '1' }] })} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-amber-700"><Plus className="h-4 w-4" /> Add sale item</button>

          {ingredientUsage.size > 0 && (
            <div className="mt-4 rounded-lg bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-500 uppercase mb-2">Recipe stock to deduct</p><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{ [...ingredientUsage.entries()].map(([itemId, quantity]) => {
              const item = itemById.get(itemId);
              const short = quantity > Number(item?.currentStock || 0);
              return <p key={itemId} className={`text-sm ${short ? 'text-red-700' : 'text-slate-600'}`}>{item?.name || 'Unknown ingredient'}: <strong>{formatQty(quantity)} {item?.unit}</strong><span className="text-xs"> · available {formatQty(Number(item?.currentStock || 0))}</span></p>;
            })}</div></div>
          )}
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><p className="text-lg font-bold text-slate-900">Sale total: {money(saleTotal)}</p><button type="submit" disabled={saving || activeMenus.length === 0 || shortages.length > 0 || validLines.length === 0} className="px-5 py-2.5 bg-slate-900 text-white rounded-lg font-semibold disabled:opacity-50">{saving ? 'Recording...' : ingredientUsage.size > 0 ? 'Record sale & deduct stock' : 'Record sale'}</button></div>
          {activeMenus.length === 0 && <p className="text-xs text-amber-700 mt-2">Create and activate a menu item before recording a sale. Recipes are optional.</p>}
        </form>
      )}

      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 mb-4"><div><h2 className="font-semibold text-slate-900">Sales history</h2><p className="text-xs text-slate-500 mt-1">Cancelled sales and reversal movements remain available for audit.</p></div><select aria-label="Filter sales by menu item" value={filterMenu} onChange={(event) => { setFilterMenu(event.target.value); setPage(1); }} className="border border-slate-300 rounded-lg px-3 py-2 text-sm"><option value="">All menu items</option>{menuItems.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}</option>)}</select></div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-2 mb-4">
          <select aria-label="Filter sales by status" value={filterStatus} onChange={(event) => { setFilterStatus(event.target.value); setPage(1); }} className="border border-slate-300 rounded-lg px-3 py-2 text-sm"><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="CANCELLED">Cancelled</option></select>
          <label className="relative"><CalendarDays className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input aria-label="Sale start date" type="date" value={startDate} max={endDate || undefined} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} className="w-full border border-slate-300 rounded-lg pl-9 pr-2 py-2 text-sm" /></label>
          <label className="relative"><CalendarDays className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input aria-label="Sale end date" type="date" min={startDate || undefined} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} className="w-full border border-slate-300 rounded-lg pl-9 pr-2 py-2 text-sm" /></label>
          <button type="button" onClick={clearFilters} disabled={!filterMenu && !filterStatus && !startDate && !endDate} className="inline-flex items-center justify-center gap-1 px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:opacity-50"><X className="h-3.5 w-3.5" /> Clear filters</button>
        </div>

        {loading ? <p className="py-12 text-center text-sm text-slate-500">Loading sales...</p> : sales.length === 0 ? (
          <div className="py-12 text-center"><ShoppingBag className="mx-auto h-8 w-8 text-slate-300 mb-3" /><p className="text-sm font-semibold text-slate-700">No sales found</p><p className="text-sm text-slate-500 mt-1">Record a sale or clear the filters to see more history.</p></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[850px]"><thead className="text-left text-slate-500 border-b"><tr><th className="py-2 pr-4">Date / reference</th><th className="pr-4">Items sold</th><th className="pr-4 text-right">Revenue</th><th className="pr-4">Status</th><th className="pr-4">Stock movements</th><th className="text-right">Actions</th></tr></thead><tbody>{sales.map((sale) => (
            <tr key={sale.id} className="border-b last:border-0 align-top"><td className="py-3 pr-4"><p className="font-semibold text-slate-900">{formatDate(sale.date)}</p><p className="text-xs text-slate-500 mt-1">{sale.reference || sale.id.slice(0, 8)}</p></td><td className="py-3 pr-4"><p>{sale.items.map((item) => `${item.quantity}× ${item.name}`).join(', ')}</p><p className="text-xs text-slate-500 mt-1">{sale.items.reduce((sum, item) => sum + item.quantity, 0)} items</p></td><td className="py-3 pr-4 text-right font-semibold whitespace-nowrap">{money(sale.total)}</td><td className="py-3 pr-4"><span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${sale.status === 'CANCELLED' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>{sale.status}</span></td><td className="py-3 pr-4">{sale.movements.filter((movement) => movement.type === 'USAGE' && movement.status === 'ACTIVE').length} ingredient deductions</td><td className="py-3"><div className="flex justify-end gap-1"><button type="button" onClick={() => void openDetails(sale)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg" title="View sale details"><Eye className="h-4 w-4" /></button>{sale.status === 'ACTIVE' && <button type="button" onClick={() => openCancel(sale)} className="p-2 text-red-700 hover:bg-red-50 rounded-lg" title="Cancel sale"><Ban className="h-4 w-4" /></button>}</div></td></tr>
          ))}</tbody></table></div>
        )}
        <div className="flex items-center justify-between mt-4"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} className="inline-flex items-center gap-1 text-sm disabled:text-slate-300"><ChevronLeft className="h-4 w-4" /> Previous</button><span className="text-sm text-slate-500">Page {page} of {totalPages}</span><button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)} className="inline-flex items-center gap-1 text-sm disabled:text-slate-300">Next <ChevronRight className="h-4 w-4" /></button></div>
      </section>

      {detail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="sale-detail-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !detailLoading) setDetail(null); }}>
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-5">
            <div className="flex items-start justify-between gap-3 mb-4"><div><h2 id="sale-detail-title" className="text-lg font-bold text-slate-900">Sale details</h2><p className="text-xs text-slate-500 mt-1">{detail.id}</p></div><button type="button" onClick={() => setDetail(null)} className="p-2 hover:bg-slate-100 rounded-lg" aria-label="Close sale details"><X className="h-5 w-5" /></button></div>
            {detailLoading ? <p className="text-sm text-slate-500 py-8 text-center">Loading sale details...</p> : <>
              <div className="grid sm:grid-cols-3 gap-3 mb-4 text-sm"><div className="bg-slate-50 rounded-lg p-3"><p className="text-xs text-slate-500">Revenue</p><p className="font-bold text-lg mt-1">{money(detail.total)}</p></div><div className="bg-slate-50 rounded-lg p-3"><p className="text-xs text-slate-500">Status</p><p className="font-semibold mt-1">{detail.status}</p></div><div className="bg-slate-50 rounded-lg p-3"><p className="text-xs text-slate-500">Recorded by</p><p className="font-semibold mt-1">{detail.createdByUser?.name || detail.createdByUser?.username || '-'}</p></div></div>
              <h3 className="font-semibold text-slate-900 mb-2">Sold items</h3><div className="overflow-x-auto"><table className="w-full text-sm mb-4"><thead className="text-left text-slate-500 border-b"><tr><th className="py-2">Item</th><th className="py-2">Quantity</th><th className="py-2 text-right">Unit price</th><th className="py-2 text-right">Total</th></tr></thead><tbody>{detail.items.map((item) => <tr key={item.id} className="border-b"><td className="py-2">{item.name}</td><td className="py-2">{item.quantity}</td><td className="py-2 text-right">{money(item.unitPrice)}</td><td className="py-2 text-right font-semibold">{money(item.total)}</td></tr>)}</tbody></table></div>
              <h3 className="font-semibold text-slate-900 mb-2">Recipe stock movements</h3><ul className="space-y-2">{detail.movements.map((movement) => <li key={movement.id} className="flex flex-wrap justify-between gap-2 bg-slate-50 rounded-lg px-3 py-2 text-sm"><span>{movement.type} · {movement.item?.name || movement.itemId} · {formatQty(movement.quantity)} {movement.item?.unit}</span><span className="text-slate-500">{movement.status} · {money(Number(movement.totalCost) || 0)}</span></li>)}</ul>
              <div className="mt-4 border-t border-slate-200 pt-4 grid sm:grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-slate-500">Reference</p><p className="font-medium mt-1">{detail.reference || '-'}</p></div><div><p className="text-xs text-slate-500">Notes</p><p className="font-medium mt-1">{detail.notes || '-'}</p></div><div><p className="text-xs text-slate-500">Cancelled by / on</p><p className="font-medium mt-1">{detail.cancelledAt ? `${detail.cancelledByUser?.name || detail.cancelledByUser?.username || '-'} · ${new Date(detail.cancelledAt).toLocaleString()}` : '-'}</p></div><div><p className="text-xs text-slate-500">Cancellation reason</p><p className="font-medium mt-1">{detail.cancellationReason || '-'}</p></div></div>
            </>}
          </div>
        </div>
      )}

      {cancelTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="cancel-sale-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setCancelTarget(null); }}>
          <form onSubmit={submitCancellation} className="bg-white rounded-xl shadow-xl max-w-md w-full p-5"><div className="flex items-start justify-between gap-3 mb-3"><div><h2 id="cancel-sale-title" className="text-lg font-bold text-slate-900">Cancel sale?</h2><p className="text-sm text-slate-500 mt-1">{formatDate(cancelTarget.date)} · {money(cancelTarget.total)}</p></div><button type="button" onClick={() => setCancelTarget(null)} disabled={saving} className="p-2 hover:bg-slate-100 rounded-lg" aria-label="Close cancellation"><X className="h-5 w-5" /></button></div><p className="text-sm text-slate-600 mb-4">The sale will be excluded from revenue, all recipe deductions will be reversed, and stock will be restored. The audit trail is preserved.</p><label className={labelClass}>Reason</label><textarea required minLength={3} maxLength={500} rows={3} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} className={inputClass} placeholder="Why is this sale being cancelled?" /><div className="flex justify-end gap-2 mt-4"><button type="button" disabled={saving} onClick={() => setCancelTarget(null)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm">Keep sale</button><button type="submit" disabled={saving || cancelReason.trim().length < 3} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">{saving ? 'Cancelling...' : 'Cancel sale'}</button></div></form>
        </div>
      )}
    </div>
  );
};
