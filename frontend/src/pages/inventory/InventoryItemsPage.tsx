import React from 'react';
import { Archive, Edit3, Plus, RotateCcw, Search, X } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { InventoryItem, ItemCategory, ItemUnit, Supplier } from '../../types';
import { formatMoney, formatQty } from '../../utils/format';
import { ConfirmDialog } from '../../components/common/UI';

type Status = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'NEEDS_REORDER' | 'HEALTHY';
type ItemRow = InventoryItem & { status: Status; suggestedQty: number };

type ItemForm = {
  name: string;
  description: string;
  category: ItemCategory;
  unit: ItemUnit;
  inputUnit: ItemUnit;
  leadTimeDays: string;
  openingStock: string;
  unitCost: string;
  minStock: string;
  reorderLevel: string;
  targetStock: string;
  supplierId: string;
};

const STATUS_CLASS: Record<Status, string> = {
  OUT_OF_STOCK: 'bg-red-100 text-red-800',
  LOW_STOCK: 'bg-amber-100 text-amber-800',
  NEEDS_REORDER: 'bg-orange-100 text-orange-800',
  HEALTHY: 'bg-emerald-100 text-emerald-800',
};

const CATEGORIES: ItemCategory[] = ['TEA_LEAVES', 'DAIRY', 'SPICES', 'SWEETENERS', 'PACKAGING', 'SNACKS', 'OTHER'];
const UNITS: ItemUnit[] = ['KG', 'G', 'LITRES', 'ML', 'PACKETS', 'PIECES'];
const STATUSES: Status[] = ['OUT_OF_STOCK', 'LOW_STOCK', 'NEEDS_REORDER', 'HEALTHY'];

const emptyForm: ItemForm = {
  name: '',
  description: '',
  category: 'TEA_LEAVES',
  unit: 'KG',
  inputUnit: 'KG',
  leadTimeDays: '0',
  openingStock: '0',
  unitCost: '0',
  minStock: '0',
  reorderLevel: '0',
  targetStock: '0',
  supplierId: '',
};

const labelClass = 'block text-sm font-semibold mb-1 text-slate-700';
const inputClass = 'w-full min-w-0 border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100';

export const InventoryItemsPage: React.FC = () => {
  const { shop } = useAuth();
  const [items, setItems] = React.useState<ItemRow[]>([]);
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [form, setForm] = React.useState<ItemForm>(emptyForm);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<ItemRow | null>(null);
  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [archivedOnly, setArchivedOnly] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [itemRes, supplierRes] = await Promise.all([
        api.get('/items', {
          params: {
            ...(search ? { search } : {}),
            ...(category ? { category } : {}),
            ...(status ? { status } : {}),
            ...(archivedOnly ? { archivedOnly: 'true' } : {}),
          },
        }),
        api.get('/suppliers'),
      ]);
      setItems(itemRes.data.items || []);
      setSuppliers(supplierRes.data.suppliers || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, category, status, archivedOnly]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const startEdit = (item: ItemRow) => {
    setEditingId(item.id);
    setSuccess('');
    setError('');
    setForm({
      name: item.name,
      description: item.description || '',
      category: item.category,
      unit: item.unit,
      inputUnit: item.unit,
      leadTimeDays: String(item.leadTimeDays),
      openingStock: String(item.openingStock),
      unitCost: String(item.unitCost),
      minStock: String(item.minStock),
      reorderLevel: String(item.reorderLevel),
      targetStock: String(item.targetStock),
      supplierId: item.supplierId || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    const minStock = Number(form.minStock);
    const reorderLevel = Number(form.reorderLevel);
    const targetStock = Number(form.targetStock);
    if (!(minStock <= reorderLevel && reorderLevel <= targetStock)) {
      setError('Keep minimum ≤ reorder ≤ target.');
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: form.category,
      leadTimeDays: Number(form.leadTimeDays),
      unitCost: Number(form.unitCost),
      minStock,
      reorderLevel,
      targetStock,
      supplierId: form.supplierId || null,
      ...(!editingId ? { unit: form.unit, inputUnit: form.inputUnit, openingStock: Number(form.openingStock) } : {}),
    };

    setSaving(true);
    try {
      if (editingId) {
        await api.patch(`/items/${editingId}`, payload);
        setSuccess('Item details updated.');
      } else {
        await api.post('/items', payload);
        setSuccess('Item added. Opening stock was recorded in the ledger when greater than zero.');
      }
      resetForm();
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async (item: ItemRow) => {
    const restoring = !item.isActive;
    setBusyId(item.id);
    setError('');
    setSuccess('');
    try {
      await api.patch(`/items/${item.id}`, { isActive: restoring });
      setSuccess(restoring ? 'Item restored.' : 'Item archived. History preserved.');
      if (editingId === item.id) resetForm();
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
      setArchiveTarget(null);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setCategory('');
    setStatus('');
    setArchivedOnly(false);
  };

  const money = (value: number) => formatMoney(value, shop?.currency || 'INR');

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500">Manage item details and planning levels. Stock changes only through audited transactions.</p>
        </div>
        {!editingId && (
          <button type="button" onClick={() => document.getElementById('item-name')?.focus()} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg font-semibold">
            <Plus className="h-4 w-4" /> Add item
          </button>
        )}
      </div>

      {error && <div role="alert" className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      {success && <div role="status" className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">{success}</div>}

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <form onSubmit={submit} className="min-w-0 bg-white border border-slate-200 rounded-xl p-5 lg:sticky lg:top-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">{editingId ? 'Edit item' : 'Add item'}</h2>
            {editingId && <button type="button" onClick={resetForm} className="text-sm text-slate-500">Cancel</button>}
          </div>
          <label htmlFor="item-name" className={labelClass}>Name</label>
          <input id="item-name" required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${inputClass} mb-3`} />
          <label className={labelClass}>Description</label>
          <textarea maxLength={1000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${inputClass} mb-3`} rows={2} />
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className={labelClass}>Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ItemCategory })} className={inputClass}>
                {CATEGORIES.map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Unit</label>
              <select disabled={Boolean(editingId)} value={form.unit} onChange={(e) => { const unit = e.target.value as ItemUnit; setForm({ ...form, unit, inputUnit: unit }); }} className={inputClass}>
                {UNITS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
          </div>
          {!editingId && (
            <div className="mb-3">
              <label className={labelClass}>Enter opening stock and cost in</label>
              <select value={form.inputUnit} onChange={(e) => setForm({ ...form, inputUnit: e.target.value as ItemUnit })} className={inputClass}>
                {UNITS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <p className="text-xs text-slate-500 mt-1">kg/g and L/ml convert automatically. Incompatible units are rejected.</p>
            </div>
          )}
          {editingId && <p className="text-xs text-slate-500 mb-3">Unit and opening stock are locked after creation to protect ledger history.</p>}
          <div className="grid grid-cols-2 gap-3 mb-3">
            {!editingId && (
              <div>
                <label className={labelClass}>Opening stock</label>
                <input type="number" min="0" step="0.001" value={form.openingStock} onChange={(e) => setForm({ ...form, openingStock: e.target.value })} className={inputClass} />
              </div>
            )}
            <div className={!editingId ? '' : 'col-span-2'}>
              <label className={labelClass}>Unit cost {!editingId ? `(per ${form.inputUnit})` : ''}</label>
              <input required type="number" min="0" step="0.01" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Lead time (days)</label>
              <input required type="number" min="0" max="3650" step="1" value={form.leadTimeDays} onChange={(e) => setForm({ ...form, leadTimeDays: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <label className="text-xs font-semibold text-slate-700">Min<input type="number" min="0" step="0.001" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} className={`${inputClass} mt-1 px-2`} /></label>
            <label className="text-xs font-semibold text-slate-700">Reorder<input type="number" min="0" step="0.001" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} className={`${inputClass} mt-1 px-2`} /></label>
            <label className="text-xs font-semibold text-slate-700">Target<input type="number" min="0" step="0.001" value={form.targetStock} onChange={(e) => setForm({ ...form, targetStock: e.target.value })} className={`${inputClass} mt-1 px-2`} /></label>
          </div>
          <label className={labelClass}>Supplier</label>
          <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} className={`${inputClass} mb-4`}>
            <option value="">No supplier</option>
            {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}{!supplier.isActive ? ' (inactive)' : ''}</option>)}
          </select>
          <button disabled={saving} className="w-full py-2.5 bg-slate-900 text-white rounded-lg font-semibold disabled:opacity-50">
            {saving ? 'Saving...' : editingId ? 'Save changes' : 'Add item'}
          </button>
        </form>

        <section className="min-w-0 lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5">
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-2 mb-4">
            <div className="relative sm:col-span-2 xl:col-span-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input aria-label="Search inventory" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items" className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm" />
            </div>
            <select aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
              <option value="">All categories</option>
              {CATEGORIES.map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>)}
            </select>
            <select aria-label="Filter by stock status" value={status} onChange={(e) => setStatus(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
              <option value="">All statuses</option>
              {STATUSES.map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>)}
            </select>
            <select aria-label="Filter archived items" value={archivedOnly ? 'archived' : ''} onChange={(e) => setArchivedOnly(e.target.value === 'archived')} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Active + archived</option>
              <option value="archived">Archived only</option>
            </select>
          </div>
          {(search || category || status || archivedOnly) && (
            <button type="button" onClick={clearFilters} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500"><X className="h-3.5 w-3.5" /> Clear filters</button>
          )}

          {loading ? (
            <p className="py-10 text-center text-sm text-slate-500">Loading inventory...</p>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">{search || category || status || archivedOnly ? 'No items match these filters.' : 'No inventory items yet. Add your first item to begin.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="text-left text-slate-500 border-b">
                  <tr><th className="py-2">Item</th><th>Stock</th><th>Levels</th><th>Lead time</th><th>Status</th><th className="text-right">Actions</th></tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b last:border-0 align-top">
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-900">{item.name}</span>
                          {!item.isActive && <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Archived</span>}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{item.category.replace(/_/g, ' ')} · {item.supplier?.name || 'No supplier'}</p>
                        {item.description && <p className="text-xs text-slate-500 mt-1 max-w-xs">{item.description}</p>}
                      </td>
                      <td className="py-3 pr-4"><strong>{formatQty(item.currentStock)} {item.unit}</strong><p className="text-xs text-slate-500">{money(item.unitCost)} / {item.unit}</p></td>
                      <td className="py-3 pr-4 text-xs text-slate-600">{item.minStock} / {item.reorderLevel} / {item.targetStock}</td>
                      <td className="py-3 pr-4">{item.leadTimeDays} days</td>
                      <td className="py-3 pr-4"><span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${STATUS_CLASS[item.status]}`}>{item.status.replace(/_/g, ' ')}</span></td>
                      <td className="py-3">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => startEdit(item)} className="inline-flex items-center gap-1 px-2 py-1.5 text-slate-700 hover:bg-slate-100 rounded-lg"><Edit3 className="h-3.5 w-3.5" /> Edit</button>
                          <button type="button" disabled={busyId === item.id} onClick={() => setArchiveTarget(item)} className="inline-flex items-center gap-1 px-2 py-1.5 text-slate-700 hover:bg-slate-100 rounded-lg disabled:opacity-50">
                            {item.isActive ? <Archive className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                            {item.isActive ? 'Archive' : 'Restore'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      <ConfirmDialog
        open={!!archiveTarget}
        title={archiveTarget?.isActive ? 'Archive inventory item?' : 'Restore inventory item?'}
        description={archiveTarget?.isActive ? `Archive "${archiveTarget.name}"? Its stock and transaction history will be preserved, and new stock transactions will be blocked.` : `Restore "${archiveTarget?.name || ''}"? It will become available for new stock transactions again.`}
        confirmLabel={archiveTarget?.isActive ? 'Archive item' : 'Restore item'}
        tone={archiveTarget?.isActive ? 'danger' : 'primary'}
        busy={!!archiveTarget && busyId === archiveTarget.id}
        onConfirm={() => { if (archiveTarget) void toggleArchive(archiveTarget); }}
        onClose={() => setArchiveTarget(null)}
      />
    </div>
  );
};
