import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { InventoryItem, ItemCategory, Supplier } from '../../types';
import { formatMoney, formatQty, todayIso } from '../../utils/format';

type StockStatus = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'NEEDS_REORDER' | 'HEALTHY';

type ReorderItem = InventoryItem & {
  status: StockStatus;
  suggestedQty: number;
  estimatedCost: number;
};

type SupplierGroup = {
  supplierId: string | null;
  supplier: { id: string; name: string; phone: string } | null;
  items: ReorderItem[];
};

const STATUS_CLASS: Record<StockStatus, string> = {
  OUT_OF_STOCK: 'bg-red-100 text-red-800',
  LOW_STOCK: 'bg-amber-100 text-amber-800',
  NEEDS_REORDER: 'bg-orange-100 text-orange-800',
  HEALTHY: 'bg-emerald-100 text-emerald-800',
};

const CATEGORIES: ItemCategory[] = [
  'TEA_LEAVES',
  'DAIRY',
  'SPICES',
  'SWEETENERS',
  'PACKAGING',
  'SNACKS',
  'OTHER',
];

export const ReorderListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [groups, setGroups] = React.useState<SupplierGroup[]>([]);
  const [items, setItems] = React.useState<ReorderItem[]>([]);
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [supplierId, setSupplierId] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [status, setStatus] = React.useState(searchParams.get('status') || '');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [levels, setLevels] = React.useState({ minStock: '', reorderLevel: '', targetStock: '' });

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [listRes, supplierRes] = await Promise.all([
        api.get('/replenishment/reorder-list', {
          params: {
            ...(supplierId ? { supplierId } : {}),
            ...(category ? { category } : {}),
            ...(status ? { status } : {}),
          },
        }),
        api.get('/suppliers'),
      ]);
      setGroups(listRes.data.bySupplier || []);
      setItems(listRes.data.items || []);
      setSuppliers(supplierRes.data.suppliers || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [supplierId, category, status]);

  React.useEffect(() => {
    load();
  }, [load]);

  const startEdit = (item: ReorderItem) => {
    setEditingId(item.id);
    setLevels({
      minStock: String(item.minStock),
      reorderLevel: String(item.reorderLevel),
      targetStock: String(item.targetStock),
    });
    setSuccess('');
    setError('');
  };

  const saveLevels = async (itemId: string) => {
    const minStock = Number(levels.minStock);
    const reorderLevel = Number(levels.reorderLevel);
    const targetStock = Number(levels.targetStock);
    if (!(minStock <= reorderLevel && reorderLevel <= targetStock)) {
      setError('Keep minimum ≤ reorder ≤ target.');
      return;
    }
    try {
      await api.patch(`/items/${itemId}/levels`, { minStock, reorderLevel, targetStock });
      setSuccess('Stock levels updated.');
      setEditingId(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const exportCsv = () => {
    const header = [
      'Item',
      'Category',
      'Unit',
      'Current',
      'Minimum',
      'Reorder',
      'Target',
      'Suggested',
      'Supplier',
      'Estimated cost',
      'Status',
    ];
    const rows = items.map((item) => [
      item.name,
      item.category,
      item.unit,
      item.currentStock,
      item.minStock,
      item.reorderLevel,
      item.targetStock,
      item.suggestedQty,
      item.supplier?.name || 'Items without a supplier',
      item.estimatedCost,
      item.status,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reorder-list-${todayIso()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderItem = (item: ReorderItem) => (
    <div key={item.id} className="border-b border-slate-100 last:border-0 py-4">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-900">{item.name}</p>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CLASS[item.status]}`}>
              {item.status.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {item.category.replace(/_/g, ' ')} • {formatQty(item.currentStock)} {item.unit}
            {' '}(min {formatQty(item.minStock)} / reorder {formatQty(item.reorderLevel)} / target {formatQty(item.targetStock)})
          </p>
        </div>
        <div className="text-sm">
          <p className="font-semibold text-slate-900">Suggest {formatQty(item.suggestedQty)} {item.unit}</p>
          <p className="text-xs text-slate-500">{formatMoney(item.estimatedCost)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => startEdit(item)} className="px-3 py-1.5 text-sm border rounded-lg">
            Edit levels
          </button>
          <button
            onClick={() =>
              navigate(
                `/transactions/purchase?itemId=${item.id}&quantity=${item.suggestedQty}&supplierId=${item.supplierId || ''}`
              )
            }
            className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded-lg"
          >
            Record purchase
          </button>
        </div>
      </div>
      {editingId === item.id && (
        <div className="mt-3 grid sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-lg">
          <label className="text-xs font-semibold">
            Minimum
            <input
              type="number"
              min="0"
              step="0.001"
              value={levels.minStock}
              onChange={(e) => setLevels({ ...levels, minStock: e.target.value })}
              className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs font-semibold">
            Reorder
            <input
              type="number"
              min="0"
              step="0.001"
              value={levels.reorderLevel}
              onChange={(e) => setLevels({ ...levels, reorderLevel: e.target.value })}
              className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs font-semibold">
            Target
            <input
              type="number"
              min="0"
              step="0.001"
              value={levels.targetStock}
              onChange={(e) => setLevels({ ...levels, targetStock: e.target.value })}
              className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
            />
          </label>
          <div className="flex items-end gap-2">
            <button onClick={() => saveLevels(item.id)} className="px-3 py-2 bg-slate-900 text-white rounded-lg text-sm">
              Save
            </button>
            <button onClick={() => setEditingId(null)} className="px-3 py-2 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto print:p-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 print:mb-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reorder list</h1>
          <p className="text-sm text-slate-500">Suggested quantities are calculated on the server as target − current stock.</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <button onClick={exportCsv} disabled={items.length === 0} className="px-3 py-2 border rounded-lg text-sm">
            Export CSV
          </button>
          <button onClick={() => window.print()} className="px-3 py-2 bg-amber-600 text-white rounded-lg text-sm">
            Print for supplier
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4 print:hidden">
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All suppliers</option>
          <option value="none">Items without a supplier</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">Needs restocking</option>
          <option value="OUT_OF_STOCK">Out of stock</option>
          <option value="LOW_STOCK">Low stock</option>
          <option value="NEEDS_REORDER">Needs reorder</option>
        </select>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      {success && <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">{success}</div>}

      {loading ? (
        <p className="text-sm text-slate-500">Loading reorder list...</p>
      ) : items.length === 0 ? (
        <div className="bg-white border rounded-xl p-10 text-center">
          <p className="font-semibold text-slate-900">Nothing needs restocking</p>
          <p className="text-sm text-slate-500 mt-1">Active items are currently above their reorder levels.</p>
          <Link to="/inventory" className="inline-block mt-4 text-sm text-amber-700 font-semibold">
            Review inventory levels
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.supplierId || 'none'} className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold text-slate-900">
                  {group.supplier?.name || 'Items without a supplier'}
                </h2>
                {group.supplier?.phone && <p className="text-xs text-slate-500">{group.supplier.phone}</p>}
              </div>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500 border-b">
                    <tr>
                      <th className="py-2">Item</th>
                      <th>Category</th>
                      <th>Current</th>
                      <th>Min / Reorder / Target</th>
                      <th>Suggested</th>
                      <th>Est. cost</th>
                      <th className="print:hidden"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => (
                      <tr key={item.id} className="border-b last:border-0 align-top">
                        <td className="py-3">
                          <div className="font-medium">{item.name}</div>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CLASS[item.status]}`}>
                            {item.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td>{item.category.replace(/_/g, ' ')}</td>
                        <td>
                          {formatQty(item.currentStock)} {item.unit}
                        </td>
                        <td>
                          {formatQty(item.minStock)} / {formatQty(item.reorderLevel)} / {formatQty(item.targetStock)}
                        </td>
                        <td>
                          {formatQty(item.suggestedQty)} {item.unit}
                        </td>
                        <td>{formatMoney(item.estimatedCost)}</td>
                        <td className="print:hidden">
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => startEdit(item)} className="text-amber-700 font-semibold">
                              Levels
                            </button>
                            <button
                              onClick={() =>
                                navigate(
                                  `/transactions/purchase?itemId=${item.id}&quantity=${item.suggestedQty}&supplierId=${item.supplierId || ''}`
                                )
                              }
                              className="text-slate-700 font-semibold"
                            >
                              Purchase
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden">{group.items.map(renderItem)}</div>
              {group.items.some((item) => item.id === editingId) && (
                <div className="hidden md:block">{group.items.filter((item) => item.id === editingId).map(renderItem)}</div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
