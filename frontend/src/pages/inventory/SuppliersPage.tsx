import React from 'react';
import { api } from '../../api/client';
import { Supplier } from '../../types';

export const SuppliersPage: React.FC = () => {
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [editing, setEditing] = React.useState<Supplier | null>(null);
  const [form, setForm] = React.useState({ name: '', phone: '', email: '', address: '', notes: '' });

  const load = async () => { setLoading(true); setError(''); try { const res = await api.get('/suppliers'); setSuppliers(res.data.suppliers || []); } catch (e: any) { setError(e.message); } finally { setLoading(false); } };
  React.useEffect(() => { load(); }, []);

  const openEdit = (supplier?: Supplier) => { setEditing(supplier || null); setForm(supplier ? { name: supplier.name, phone: supplier.phone, email: supplier.email || '', address: supplier.address || '', notes: supplier.notes || '' } : { name: '', phone: '', email: '', address: '', notes: '' }); };
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setError(''); setSuccess(''); try { if (editing) await api.patch(`/suppliers/${editing.id}`, form); else await api.post('/suppliers', form); setSuccess(editing ? 'Supplier updated' : 'Supplier added'); openEdit(); await load(); } catch (e: any) { setError(e.message); } };

  return <div className="p-4 sm:p-6 max-w-6xl mx-auto"><div className="flex items-center justify-between mb-6"><div><h1 className="text-2xl font-bold text-slate-900">Suppliers</h1><p className="text-sm text-slate-500">Manage suppliers and purchase sources</p></div><button onClick={() => openEdit()} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold">Add supplier</button></div>
    {error && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}{success && <div className="mb-4 p-3 rounded-lg bg-green-50 text-green-700 text-sm">{success}</div>}
    <div className="grid md:grid-cols-3 gap-6"><form onSubmit={submit} className="md:col-span-1 bg-white border rounded-xl p-5 h-fit"><h2 className="font-semibold mb-4">{editing ? 'Edit supplier' : 'New supplier'}</h2>{(['name','phone','email','address','notes'] as const).map(field => <label key={field} className="block mb-3"><span className="block text-sm font-semibold mb-1 capitalize">{field}</span>{field === 'address' || field === 'notes' ? <textarea value={form[field]} onChange={e => setForm({...form,[field]:e.target.value})} className="w-full border rounded-lg px-3 py-2" /> : <input required={field === 'name' || field === 'phone'} type={field === 'email' ? 'email' : 'text'} value={form[field]} onChange={e => setForm({...form,[field]:e.target.value})} className="w-full border rounded-lg px-3 py-2" />}</label>)}<button className="w-full py-2.5 bg-amber-600 text-white rounded-lg font-semibold">{editing ? 'Save changes' : 'Add supplier'}</button></form>
    <section className="md:col-span-2 bg-white border rounded-xl p-5">{loading ? <p className="text-sm text-slate-500">Loading suppliers...</p> : suppliers.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">No suppliers yet</p> : <div className="divide-y">{suppliers.map(s => <div key={s.id} className="py-4 flex items-start justify-between"><div><p className="font-semibold text-slate-900">{s.name}</p><p className="text-sm text-slate-500">{s.phone}{s.email ? ` • ${s.email}` : ''}</p>{s.address && <p className="text-xs text-slate-400 mt-1">{s.address}</p>}</div><button onClick={() => openEdit(s)} className="text-sm text-amber-700 font-semibold">Edit</button></div>)}</div>}</section></div></div>;
};
