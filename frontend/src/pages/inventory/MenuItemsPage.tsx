import React from 'react';
import { BookOpen, Coffee, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { api } from '../../api/client';
import { createMenuItem, getMenuItems, MenuCategory, MenuPayload, updateMenuItem } from '../../api/menu';
import { useAuth } from '../../context/AuthContext';
import { InventoryItem, MenuItem } from '../../types';
import { formatMoney, formatQty } from '../../utils/format';

type RecipeRow = { itemId: string; quantity: string };
type MenuForm = {
  name: string;
  description: string;
  category: MenuCategory;
  sellingPrice: string;
  isActive: boolean;
  recipeItems: RecipeRow[];
};

const categories: MenuCategory[] = ['TEA', 'COFFEE', 'BEVERAGE', 'SNACK', 'OTHER'];
const labelClass = 'block text-sm font-semibold mb-1 text-slate-700';
const inputClass = 'w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100';

const emptyForm = (): MenuForm => ({
  name: '',
  description: '',
  category: 'TEA',
  sellingPrice: '',
  isActive: true,
  recipeItems: [{ itemId: '', quantity: '' }],
});

function recipeCost(menu: MenuItem): number {
  return menu.recipeItems.reduce((sum, recipe) => sum + recipe.quantity * Number(recipe.item?.unitCost || 0), 0);
}

export const MenuItemsPage: React.FC = () => {
  const { shop } = useAuth();
  const [menuItems, setMenuItems] = React.useState<MenuItem[]>([]);
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [activeOnly, setActiveOnly] = React.useState('');
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<MenuItem | null>(null);
  const [form, setForm] = React.useState<MenuForm>(emptyForm);
  const money = (value: number) => formatMoney(Number(value) || 0, shop?.currency || 'INR');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [menuResponse, itemResponse] = await Promise.all([
        getMenuItems({
          limit: 100,
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(category ? { category: category as MenuCategory } : {}),
          ...(activeOnly ? { activeOnly: activeOnly as 'true' | 'false' } : {}),
        }),
        api.get('/items'),
      ]);
      setMenuItems(menuResponse.menuItems || []);
      setItems(itemResponse.data.items || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, category, activeOnly]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormOpen(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormOpen(true);
    setError('');
    setSuccess('');
  };

  const openEdit = (menuItem: MenuItem) => {
    setEditing(menuItem);
    setForm({
      name: menuItem.name,
      description: menuItem.description || '',
      category: menuItem.category,
      sellingPrice: String(menuItem.sellingPrice),
      isActive: menuItem.isActive,
      recipeItems: menuItem.recipeItems.map((recipe) => ({ itemId: recipe.itemId, quantity: String(recipe.quantity) })),
    });
    setFormOpen(true);
    setError('');
    setSuccess('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateRecipe = (index: number, patch: Partial<RecipeRow>) => {
    setForm((current) => ({
      ...current,
      recipeItems: current.recipeItems.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row),
    }));
  };

  const selectedItems = form.recipeItems.map((row) => items.find((item) => item.id === row.itemId));
  const estimatedCost = form.recipeItems.reduce((sum, row, index) => {
    const item = selectedItems[index];
    return sum + (item ? Number(row.quantity) * Number(item.unitCost) : 0);
  }, 0);
  const sellingPrice = Number(form.sellingPrice);
  const estimatedMargin = Number.isFinite(sellingPrice) ? sellingPrice - estimatedCost : 0;
  const recipeItemIds = form.recipeItems.map((row) => row.itemId).filter(Boolean);
  const hasDuplicateRecipes = new Set(recipeItemIds).size !== recipeItemIds.length;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (hasDuplicateRecipes) {
      setError('Each inventory item can appear only once in a recipe.');
      return;
    }
    if (!(sellingPrice > 0) || form.recipeItems.some((row) => !row.itemId || !(Number(row.quantity) > 0))) {
      setError('Enter a selling price and a positive quantity for every ingredient.');
      return;
    }
    const invalidCount = form.recipeItems.some((row, index) => {
      const unit = selectedItems[index]?.unit;
      return (unit === 'PIECES' || unit === 'PACKETS') && !Number.isInteger(Number(row.quantity));
    });
    if (invalidCount) {
      setError('Packet and piece quantities must be whole numbers.');
      return;
    }
    setSaving(true);
    try {
      const payload: MenuPayload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        category: form.category,
        sellingPrice,
        isActive: form.isActive,
        recipeItems: form.recipeItems.map((row) => ({ itemId: row.itemId, quantity: Number(row.quantity) })),
      };
      const result = editing ? await updateMenuItem(editing.id, payload) : await createMenuItem(payload);
      setSuccess(result.message);
      resetForm();
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Menu items & recipes</h1>
          <p className="text-sm text-slate-500">Define selling prices and the ingredients deducted automatically with every sale.</p>
        </div>
        <button type="button" onClick={openCreate} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold">
          <Plus className="h-4 w-4" /> Add menu item
        </button>
      </div>

      {error && <div role="alert" className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      {success && <div role="status" className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">{success}</div>}

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5 grid md:grid-cols-3 gap-3">
        <label className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input aria-label="Search menu items" value={search} onChange={(event) => setSearch(event.target.value)} className={`${inputClass} pl-9`} placeholder="Search menu items" /></label>
        <select aria-label="Filter menu by category" value={category} onChange={(event) => setCategory(event.target.value)} className={inputClass}><option value="">All categories</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <select aria-label="Filter menu by availability" value={activeOnly} onChange={(event) => setActiveOnly(event.target.value)} className={inputClass}><option value="">Active and unavailable</option><option value="true">Available for sale</option><option value="false">Unavailable</option></select>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-56 bg-white border rounded-xl animate-pulse" />)}</div>
      ) : menuItems.length === 0 ? (
        <div className="bg-white border rounded-xl py-14 text-center"><BookOpen className="mx-auto h-9 w-9 text-slate-300 mb-3" /><p className="font-semibold text-slate-800">No menu items found</p><p className="text-sm text-slate-500 mt-1">Add a drink or snack and define its recipe to start recording sales.</p></div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {menuItems.map((menuItem) => {
            const cost = recipeCost(menuItem);
            return (
              <article key={menuItem.id} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><div className="flex items-center gap-2"><Coffee className="h-4 w-4 text-amber-600 shrink-0" /><h2 className="font-semibold text-slate-900 truncate">{menuItem.name}</h2></div><p className="text-xs text-slate-500 mt-1">{menuItem.category} · {menuItem.recipeItems.length} ingredients</p></div>
                  <button type="button" onClick={() => openEdit(menuItem)} className="p-2 text-amber-700 hover:bg-amber-50 rounded-lg" title="Edit menu item"><Pencil className="h-4 w-4" /></button>
                </div>
                <p className="text-sm text-slate-600 mt-3 min-h-[40px] line-clamp-2">{menuItem.description || 'No description provided.'}</p>
                <div className="grid grid-cols-2 gap-2 my-4">
                  <div className="bg-amber-50 rounded-lg p-3"><p className="text-[11px] font-semibold text-amber-800 uppercase">Selling price</p><p className="text-lg font-bold text-slate-900 mt-1">{money(menuItem.sellingPrice)}</p></div>
                  <div className="bg-slate-50 rounded-lg p-3"><p className="text-[11px] font-semibold text-slate-500 uppercase">Est. ingredient cost</p><p className="text-lg font-bold text-slate-900 mt-1">{money(cost)}</p><p className="text-[11px] text-slate-500">Margin {money(menuItem.sellingPrice - cost)}</p></div>
                </div>
                <div className="border-t border-slate-100 pt-3 flex-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Recipe per sale</p>
                  <ul className="space-y-2">{menuItem.recipeItems.map((recipe) => (
                    <li key={recipe.id} className="flex items-center justify-between gap-3 text-sm"><span className="text-slate-700 truncate">{recipe.item?.name || 'Missing item'}</span><span className="text-slate-500 whitespace-nowrap">{formatQty(recipe.quantity)} {recipe.item?.unit}</span></li>
                  ))}</ul>
                </div>
                <div className="mt-4 flex items-center justify-between"><span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${menuItem.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>{menuItem.isActive ? 'AVAILABLE' : 'UNAVAILABLE'}</span><span className="text-xs text-slate-500">Historical sales keep saved prices</span></div>
              </article>
            );
          })}
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="menu-form-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) resetForm(); }}>
          <form onSubmit={submit} className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[92vh] overflow-y-auto p-5">
            <div className="flex items-start justify-between gap-3 mb-5"><div><h2 id="menu-form-title" className="text-lg font-bold text-slate-900">{editing ? 'Edit menu item & recipe' : 'Add menu item & recipe'}</h2><p className="text-xs text-slate-500 mt-1">Recipe quantities use each inventory item's base unit. Existing sales remain unchanged.</p></div><button type="button" onClick={resetForm} disabled={saving} className="p-2 hover:bg-slate-100 rounded-lg" aria-label="Close menu form"><X className="h-5 w-5" /></button></div>
            <div className="grid md:grid-cols-2 gap-3">
              <div><label className={labelClass}>Menu item name</label><input required maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} placeholder="e.g. Masala Chai" /></div>
              <div><label className={labelClass}>Category</label><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as MenuCategory })} className={inputClass}>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
              <div className="md:col-span-2"><label className={labelClass}>Description</label><textarea maxLength={1000} rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={inputClass} placeholder="Optional customer-facing description" /></div>
              <div><label className={labelClass}>Selling price ({shop?.currency || 'INR'})</label><input required type="number" min="0.01" step="0.01" value={form.sellingPrice} onChange={(event) => setForm({ ...form, sellingPrice: event.target.value })} className={inputClass} /></div>
              <label className="flex items-center gap-2 mt-6 text-sm font-medium text-slate-700"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} className="h-4 w-4 accent-amber-600" /> Available for new sales</label>
            </div>

            <div className="mt-5 border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between mb-3"><div><h3 className="font-semibold text-slate-900">Recipe ingredients</h3><p className="text-xs text-slate-500 mt-1">Amounts consumed for one sold item.</p></div><button type="button" onClick={() => setForm({ ...form, recipeItems: [...form.recipeItems, { itemId: '', quantity: '' }] })} className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700"><Plus className="h-4 w-4" /> Add ingredient</button></div>
              <div className="space-y-2">
                {form.recipeItems.map((row, index) => {
                  const item = selectedItems[index];
                  return (
                    <div key={index} className="grid grid-cols-[1fr_130px_auto] sm:grid-cols-[1fr_150px_36px] gap-2 items-end">
                      <div><label className="text-xs font-semibold text-slate-600">Inventory item</label><select required value={row.itemId} onChange={(event) => updateRecipe(index, { itemId: event.target.value })} className={inputClass}><option value="">Choose ingredient</option>{items.filter((candidate) => candidate.isActive || candidate.id === row.itemId).map((candidate) => <option key={candidate.id} value={candidate.id} disabled={recipeItemIds.includes(candidate.id) && candidate.id !== row.itemId}>{candidate.name} ({formatQty(candidate.currentStock)} {candidate.unit})</option>)}</select></div>
                      <div><label className="text-xs font-semibold text-slate-600">Quantity {item ? `(${item.unit})` : ''}</label><input required type="number" min="0.001" step={item?.unit === 'PIECES' || item?.unit === 'PACKETS' ? '1' : '0.001'} value={row.quantity} onChange={(event) => updateRecipe(index, { quantity: event.target.value })} className={inputClass} /></div>
                      <button type="button" disabled={form.recipeItems.length === 1} onClick={() => setForm({ ...form, recipeItems: form.recipeItems.filter((_, rowIndex) => rowIndex !== index) })} className="h-10 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30" title="Remove ingredient"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 bg-slate-50 rounded-lg p-3 grid sm:grid-cols-3 gap-3 text-sm"><p className="text-slate-600">Estimated ingredient cost: <strong className="text-slate-900">{money(estimatedCost)}</strong></p><p className="text-slate-600">Estimated margin: <strong className={estimatedMargin < 0 ? 'text-red-700' : 'text-slate-900'}>{money(estimatedMargin)}</strong></p><p className="text-slate-500">Based on current weighted-average costs</p></div>
            </div>

            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={resetForm} disabled={saving} className="px-4 py-2 border border-slate-300 rounded-lg text-sm">Cancel</button><button type="submit" disabled={saving || !form.name || !form.sellingPrice || form.recipeItems.some((row) => !row.itemId || !row.quantity)} className="px-5 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold disabled:opacity-50">{saving ? 'Saving...' : editing ? 'Save changes' : 'Create menu item'}</button></div>
          </form>
        </div>
      )}
    </div>
  );
};
