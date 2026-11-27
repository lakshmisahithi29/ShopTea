import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatMoney, formatQty, todayIso, daysAgoIso } from '../utils/format';

type RangePreset = 'today' | '7' | '30' | 'custom';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [preset, setPreset] = React.useState<RangePreset>('30');
  const [from, setFrom] = React.useState(daysAgoIso(30));
  const [to, setTo] = React.useState(todayIso());
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [summary, setSummary] = React.useState<any>(null);
  const [movements, setMovements] = React.useState<any[]>([]);
  const [trend, setTrend] = React.useState<any>(null);
  const [wastage, setWastage] = React.useState<any>(null);
  const [wastageTrend, setWastageTrend] = React.useState<any>(null);
  const [replenishment, setReplenishment] = React.useState<any[]>([]);
  const [alerts, setAlerts] = React.useState<any[]>([]);
  const { shop } = useAuth();
  const money = (value: number) => formatMoney(value, shop?.currency || 'INR');

  const applyPreset = (next: RangePreset) => {
    setPreset(next);
    if (next === 'today') {
      setFrom(todayIso());
      setTo(todayIso());
    } else if (next === '7') {
      setFrom(daysAgoIso(7));
      setTo(todayIso());
    } else if (next === '30') {
      setFrom(daysAgoIso(30));
      setTo(todayIso());
    }
  };

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { from, to };
      const [summaryRes, recentRes, trendRes, wastageRes, wastageTrendRes, replenishmentRes, alertsRes] = await Promise.all([
        api.get('/dashboard/summary'),
        api.get('/dashboard/recent-movements'),
        api.get('/dashboard/movement-trend', { params }),
        api.get('/dashboard/wastage-summary', { params }),
        api.get('/dashboard/wastage-trend', { params }),
        api.get('/dashboard/replenishment'),
        api.get('/alerts', { params: { status: 'ACTIVE', limit: 5 } }),
      ]);
      setSummary(summaryRes.data);
      setMovements(recentRes.data.movements || []);
      setTrend(trendRes.data);
      setWastage(wastageRes.data);
      setWastageTrend(wastageTrendRes.data);
      setReplenishment(replenishmentRes.data.items || []);
      setAlerts(alertsRes.data.alerts || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  React.useEffect(() => {
    load();
  }, [load]);

  const cards = summary?.summary;
  const emptyShop = cards && cards.totalActiveItems === 0 && movements.length === 0;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Live numbers from your shop inventory and stock movements.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['today', '7', '30', 'custom'] as RangePreset[]).map((p) => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className={`px-3 py-1.5 rounded-lg text-sm border ${preset === p ? 'bg-amber-600 text-white border-amber-600' : 'bg-white'}`}
            >
              {p === 'today' ? 'Today' : p === '7' ? 'Last 7 days' : p === '30' ? 'Last 30 days' : 'Custom'}
            </button>
          ))}
          {preset === 'custom' && (
            <div className="flex gap-2">
              <input aria-label="Dashboard start date" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" />
              <input aria-label="Dashboard end date" type="date" value={to} min={from} max={todayIso()} onChange={(e) => setTo(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <button onClick={() => navigate('/inventory')} className="px-3 py-2 bg-amber-600 text-white rounded-lg text-sm">Add item</button>
        <button onClick={() => navigate('/purchases/new')} className="px-3 py-2 bg-white border rounded-lg text-sm">Record purchase</button>
        <button onClick={() => navigate('/menu')} className="px-3 py-2 bg-white border rounded-lg text-sm">Menu & recipes</button>
        <button onClick={() => navigate('/sales/new')} className="px-3 py-2 bg-amber-600 text-white rounded-lg text-sm">Record sale</button>
        <button onClick={() => navigate('/usage/new')} className="px-3 py-2 bg-white border rounded-lg text-sm">Record usage</button>
        <button onClick={() => navigate('/transactions/wastage')} className="px-3 py-2 bg-white border rounded-lg text-sm">Record wastage</button>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 bg-white border rounded-lg text-sm disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={load} className="font-semibold">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 bg-white border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !cards ? (
        <div className="bg-white border rounded-xl p-8 text-center">
          <p className="font-semibold text-slate-900">Dashboard data is unavailable</p>
          <button onClick={load} className="mt-3 px-3 py-2 bg-amber-600 text-white rounded-lg text-sm">Retry</button>
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
            <SummaryCard label="Active items" value={cards.totalActiveItems} />
            <SummaryCard label="Inventory value" value={money(cards.totalInventoryValue)} />
            <SummaryCard label="Low stock" value={cards.lowStockCount} to="/reorder?status=LOW_STOCK" />
            <SummaryCard label="Out of stock" value={cards.outOfStockCount} to="/reorder?status=OUT_OF_STOCK" />
            <SummaryCard label="Needs replenishment" value={cards.itemsNeedingReplenishment} to="/reorder" />
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <SummaryCard label="Sales today" value={cards.salesCountToday || 0} to="/sales" />
            <SummaryCard label="Revenue today" value={money(cards.salesRevenueToday || 0)} to="/sales" />
            <SummaryCard label="COGS today" value={money(cards.cogsToday || 0)} to="/sales" />
            <SummaryCard label="Gross profit today" value={money(cards.grossProfitToday || 0)} to="/sales" />
          </div>

          {emptyShop && (
            <div className="bg-white border rounded-xl p-8 text-center mb-6">
              <p className="font-semibold text-slate-900">Record your first purchase to see trends</p>
              <p className="text-sm text-slate-500 mt-1">This shop has no inventory yet. Add an item, then record a purchase.</p>
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <ChartCard title="Inventory movement (value)" empty={!(trend?.totals?.purchaseValue || trend?.totals?.usageValue)}>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={trend?.series || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => money(v)} />
                  <Legend />
                  <Area type="monotone" dataKey="purchaseValue" name="Purchases" stroke="#d97706" fill="#fde68a" />
                  <Area type="monotone" dataKey="usageValue" name="Usage" stroke="#0f766e" fill="#99f6e4" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Wastage trend (value)" empty={!wastageTrend?.totalValue}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={wastageTrend?.series || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => money(v)} />
                  <Bar dataKey="value" name="Wastage value" fill="#e11d48" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {(summary?.stockValueByCategory || []).length > 0 && (
            <div className="bg-white border rounded-xl p-5 mb-6">
              <h2 className="font-semibold mb-4">Stock value by category</h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={summary.stockValueByCategory}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => money(v)} />
                  <Bar dataKey="value" fill="#b45309" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-6 mb-6">
            <ListCard title="Current stock levels" emptyText="No items yet">
              {(summary?.topItemsByStock || []).map((item: any) => (
                <li key={item.id} className="flex justify-between py-2 text-sm">
                  <span>{item.name}</span>
                  <span className="text-slate-500">{formatQty(item.currentStock)} {item.unit} · {item.status.replace(/_/g, ' ')}</span>
                </li>
              ))}
            </ListCard>
            <ListCard title="Stock notifications" emptyText="No active stock alerts" action={<Link to="/alerts" className="text-sm text-amber-700 font-semibold">View all</Link>}>
              {alerts.map((alert: any) => (
                <li key={alert.id} className="py-2 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <Link to="/alerts" className="font-medium text-slate-900">{alert.item?.name || alert.title}</Link>
                    {!alert.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" title="Unread" />}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{alert.title} · {formatQty(alert.currentStock)} {alert.item?.unit}</p>
                </li>
              ))}
            </ListCard>
            <ListCard title="Needs replenishment" emptyText="Nothing needs restocking" action={<Link to="/reorder" className="text-sm text-amber-700 font-semibold">View all</Link>}>
              {replenishment.map((item: any) => (
                <li key={item.id} className="flex justify-between py-2 text-sm">
                  <span>{item.name}</span>
                  <span className="text-slate-500">+{formatQty(item.suggestedQty)} {item.unit}</span>
                </li>
              ))}
            </ListCard>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white border rounded-xl p-5">
              <h2 className="font-semibold mb-3">Recent stock movements</h2>
              {movements.length === 0 ? (
                <p className="text-sm text-slate-500">No movements recorded yet.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {movements.map((tx) => (
                    <li key={tx.id} className="py-2 flex justify-between gap-3">
                      <span>
                        <span className="font-medium">{tx.item?.name}</span>
                        <span className="text-slate-500"> · {tx.type}</span>
                      </span>
                      <span className="text-slate-500">
                        {formatQty(tx.quantity)} {tx.unit} · {new Date(tx.date).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="bg-white border rounded-xl p-5">
              <h2 className="font-semibold mb-3">Wastage in selected period</h2>
              {!wastage?.transactionCount ? (
                <p className="text-sm text-slate-500">No wastage recorded in this date range.</p>
              ) : (
                <>
                  <p className="text-sm mb-3">Total value {money(wastage.totalValue)}</p>
                  <p className="text-xs text-slate-500 mb-2">
                    Quantities are grouped by unit so mixed units are not added together.
                    {wastage.quantityByUnit
                      ? ` ${Object.entries(wastage.quantityByUnit)
                          .map(([unit, qty]) => `${formatQty(Number(qty))} ${unit}`)
                          .join(', ')}.`
                      : ''}
                  </p>
                  <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">By reason</p>
                  <ul className="text-sm divide-y mb-4">
                    {(wastage.byReason || []).map((row: any) => (
                      <li key={row.reason} className="py-2 flex justify-between">
                        <span>{row.reason}</span>
                        <span>{money(row.value)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">By item</p>
                  <ul className="text-sm divide-y">
                    {(wastage.byItem || []).map((row: any) => (
                      <li key={row.itemId} className="py-2 flex justify-between gap-3">
                        <span>{row.name}</span>
                        <span className="text-slate-500">
                          {formatQty(row.quantity)} {row.unit} · {money(row.value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

function SummaryCard({ label, value, to }: { label: string; value: React.ReactNode; to?: string }) {
  const content = (
    <div className="bg-white border rounded-xl p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

function ChartCard({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <div className="bg-white border rounded-xl p-5">
      <h2 className="font-semibold mb-4">{title}</h2>
      {empty ? <p className="text-sm text-slate-500 py-16 text-center">Record your first purchase to see trends</p> : children}
    </div>
  );
}

function ListCard({
  title,
  emptyText,
  action,
  children,
}: {
  title: string;
  emptyText: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const list = React.Children.toArray(children);
  return (
    <div className="bg-white border rounded-xl p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {list.length === 0 ? <p className="text-sm text-slate-500">{emptyText}</p> : <ul className="divide-y">{children}</ul>}
    </div>
  );
}
