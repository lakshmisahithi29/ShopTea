import React from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { InventoryItem, ItemUnit, StockTransaction, Supplier } from '../../types';
import { todayIso } from '../../utils/format';

const today = () => todayIso();
const UNITS: ItemUnit[] = ['KG', 'G', 'LITRES', 'ML', 'PACKETS', 'PIECES'];

function unitsCompatible(a: ItemUnit, b: ItemUnit): boolean {
  if (a === b) return true;
  return (['KG', 'G'].includes(a) && ['KG', 'G'].includes(b)) || (['LITRES', 'ML'].includes(a) && ['LITRES', 'ML'].includes(b));
}

function convertedQuantity(quantity: number, inputUnit: ItemUnit, baseUnit: ItemUnit): number {
  if (inputUnit === baseUnit) return quantity;
  if (baseUnit === 'KG' && inputUnit === 'G') return quantity / 1000;
  if (baseUnit === 'G' && inputUnit === 'KG') return quantity * 1000;
  if (baseUnit === 'LITRES' && inputUnit === 'ML') return quantity / 1000;
  if (baseUnit === 'ML' && inputUnit === 'LITRES') return quantity * 1000;
  return Number.NaN;
}

export const StockTransactionsPage: React.FC = () => {
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const forcedType = params.type as 'purchase'|'usage'|'wastage'|'adjustment'|undefined;
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [transactions, setTransactions] = React.useState<StockTransaction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [type, setType] = React.useState(forcedType || 'purchase');
  const [itemId, setItemId] = React.useState('');
  const [quantity, setQuantity] = React.useState('');
  const [inputUnit, setInputUnit] = React.useState<ItemUnit>('KG');
  const [unitCost, setUnitCost] = React.useState('');
  const [supplierId, setSupplierId] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [remarks, setRemarks] = React.useState('');
  const [wastageReason, setWastageReason] = React.useState('EXPIRED');
  const [adjustmentType, setAdjustmentType] = React.useState<'INCREASE'|'DECREASE'>('INCREASE');
  const [date, setDate] = React.useState(today());
  const [filterType, setFilterType] = React.useState('');
  const [filterItem, setFilterItem] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);

  React.useEffect(() => { if (forcedType) setType(forcedType); }, [forcedType]);
  React.useEffect(() => {
    const presetItem = searchParams.get('itemId');
    const presetQty = searchParams.get('quantity');
    const presetSupplier = searchParams.get('supplierId');
    if (presetItem) setItemId(presetItem);
    if (presetQty) setQuantity(presetQty);
    if (presetSupplier) setSupplierId(presetSupplier);
  }, [searchParams]);

  const load = React.useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [itemRes, supplierRes, txRes] = await Promise.all([
        api.get('/items', { params: { activeOnly: 'true' } }),
        api.get('/suppliers'),
        api.get('/transactions', { params: { page, limit: 15, ...(filterType ? { type: filterType.toUpperCase() } : {}), ...(filterItem ? { itemId: filterItem } : {}) } }),
      ]);
      setItems(itemRes.data.items || []); setSuppliers(supplierRes.data.suppliers || []);
      setTransactions(txRes.data.transactions || []); setTotalPages(txRes.data.pagination?.totalPages || 1);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [page, filterType, filterItem]);

  React.useEffect(() => { load(); }, [load]);
  const selected = items.find(i => i.id === itemId);
  React.useEffect(() => {
    if (selected && !unitsCompatible(inputUnit, selected.unit)) setInputUnit(selected.unit);
  }, [selected, inputUnit]);
  React.useEffect(() => {
    if (selected && type === 'purchase' && !unitCost) {
      setUnitCost(String(selected.unitCost ?? ''));
    }
  }, [selected, type, unitCost]);
  const qty = Number(quantity);
  const normalizedQty = selected ? convertedQuantity(qty, inputUnit, selected.unit) : qty;
  const stockAfter = selected ? (type === 'purchase' ? Number(selected.currentStock) + normalizedQty : type === 'adjustment' ? Number(selected.currentStock) + (adjustmentType === 'INCREASE' ? normalizedQty : -normalizedQty) : Number(selected.currentStock) - normalizedQty) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true); setError(''); setSuccess('');
    try {
      const key = crypto.randomUUID();
      const body: any = { itemId, quantity: qty, inputUnit, remarks: remarks || undefined, date, idempotencyKey: key };
      if (type === 'purchase') Object.assign(body, { unitCost: Number(unitCost), supplierId: supplierId || undefined, reference: reference || undefined });
      if (type === 'wastage') body.wastageReason = wastageReason;
      if (type === 'adjustment') Object.assign(body, { adjustmentType, remarks });
      const res = await api.post(`/transactions/${type}`, body);
      setSuccess(res.data.message); setQuantity(''); setRemarks(''); setReference(''); await load();
    } catch (e: any) { setError(e.message); } finally { setSubmitting(false); }
  };

  const title = type.charAt(0).toUpperCase() + type.slice(1);
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6"><div><h1 className="text-2xl font-bold text-slate-900">{title} Stock</h1><p className="text-sm text-slate-500">Record and review inventory movements</p></div>
        <div className="flex gap-2"><button onClick={() => navigate('/transactions/purchase')} className="px-3 py-2 bg-amber-600 text-white rounded-lg text-sm">Record purchase</button><button onClick={() => navigate('/transactions/usage')} className="px-3 py-2 bg-white border rounded-lg text-sm">Record usage</button></div>
      </div>
      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      {success && <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">{success}</div>}

      <div className="grid lg:grid-cols-3 gap-6">
        <form onSubmit={submit} className="lg:col-span-1 bg-white border border-slate-200 rounded-xl p-5 h-fit">
          <label className="block text-sm font-semibold mb-2">Item</label>
          <select required value={itemId} onChange={e => setItemId(e.target.value)} className="w-full border rounded-lg px-3 py-2 mb-4"><option value="">Search / choose item</option>{items.map(i => <option key={i.id} value={i.id}>{i.name} — {i.currentStock} {i.unit}</option>)}</select>
          {type === 'purchase' && <><label className="block text-sm font-semibold mb-2">Supplier</label><select value={supplierId} onChange={e => setSupplierId(e.target.value)} className="w-full border rounded-lg px-3 py-2 mb-4"><option value="">No supplier</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><label className="block text-sm font-semibold mb-2">Unit cost (per {inputUnit})</label><input required type="number" min="0.01" step="0.01" value={unitCost} onChange={e => setUnitCost(e.target.value)} className="w-full border rounded-lg px-3 py-2 mb-4" /><label className="block text-sm font-semibold mb-2">Reference</label><input value={reference} onChange={e => setReference(e.target.value)} className="w-full border rounded-lg px-3 py-2 mb-4" /></>}
          {type === 'wastage' && <><label className="block text-sm font-semibold mb-2">Wastage reason</label><select value={wastageReason} onChange={e => setWastageReason(e.target.value)} className="w-full border rounded-lg px-3 py-2 mb-4"><option>EXPIRED</option><option>SPOILED</option><option>DAMAGED</option><option>SPILLED</option><option>OTHER</option></select></>}
          {type === 'adjustment' && <><label className="block text-sm font-semibold mb-2">Adjustment</label><select value={adjustmentType} onChange={e => setAdjustmentType(e.target.value as any)} className="w-full border rounded-lg px-3 py-2 mb-4"><option value="INCREASE">Increase</option><option value="DECREASE">Decrease</option></select></>}
          <label className="block text-sm font-semibold mb-2">Input unit</label><select value={inputUnit} onChange={e => setInputUnit(e.target.value as ItemUnit)} className="w-full border rounded-lg px-3 py-2 mb-4"><option value="" disabled>Choose unit</option>{UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select>
          <label className="block text-sm font-semibold mb-2">Quantity ({inputUnit})</label><input required type="number" min="0.001" step="0.001" value={quantity} onChange={e => setQuantity(e.target.value)} className="w-full border rounded-lg px-3 py-2 mb-4" />
          <label className="block text-sm font-semibold mb-2">Date</label><input required type="date" max={today()} value={date} onChange={e => setDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 mb-4" />
          <label className="block text-sm font-semibold mb-2">Remarks {type === 'adjustment' ? '(required)' : ''}</label><textarea required={type === 'adjustment'} value={remarks} onChange={e => setRemarks(e.target.value)} className="w-full border rounded-lg px-3 py-2 mb-4" />
          {selected && quantity && <div className="mb-4 p-3 bg-slate-50 rounded-lg text-sm">Stock after transaction: <strong>{Number.isFinite(stockAfter) ? stockAfter : selected.currentStock} {selected.unit}</strong></div>}
          <button disabled={submitting || !itemId || !quantity} className="w-full py-2.5 bg-amber-600 disabled:bg-slate-300 text-white rounded-lg font-semibold">{submitting ? 'Submitting...' : `Record ${title}`}</button>
        </form>

        <section className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex flex-wrap gap-3 mb-4"><select value={filterType} onChange={e => {setFilterType(e.target.value); setPage(1)}} className="border rounded-lg px-3 py-2 text-sm"><option value="">All types</option><option value="purchase">Purchase</option><option value="usage">Usage</option><option value="wastage">Wastage</option><option value="adjustment">Adjustment</option></select><select value={filterItem} onChange={e => {setFilterItem(e.target.value); setPage(1)}} className="border rounded-lg px-3 py-2 text-sm"><option value="">All items</option>{items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
          {loading ? <p className="text-sm text-slate-500">Loading transactions...</p> : transactions.length === 0 ? <p className="text-sm text-slate-500 py-10 text-center">No stock transactions yet</p> : <><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-slate-500 border-b"><tr><th className="py-2">Date</th><th>Item</th><th>Type</th><th>Quantity</th><th>Reference</th></tr></thead><tbody>{transactions.map(tx => <tr key={tx.id} className="border-b"><td className="py-3">{new Date(tx.date).toLocaleDateString()}</td><td>{tx.item?.name}</td><td><span className="px-2 py-1 rounded-full bg-slate-100">{tx.type}</span></td><td>{tx.quantity} {tx.item?.unit}</td><td>{tx.reference || tx.remarks || tx.supplier?.name || '-'}</td></tr>)}</tbody></table></div><div className="flex justify-between mt-4"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="text-sm disabled:text-slate-300">Previous</button><span className="text-sm text-slate-500">Page {page} of {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="text-sm disabled:text-slate-300">Next</button></div></>}
        </section>
      </div>
    </div>
  );
};
