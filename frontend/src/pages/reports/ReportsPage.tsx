import React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, RefreshCw } from 'lucide-react';
import { api } from '../../api/client';
import {
  downloadReportCsv,
  getReport,
  MetricComparison,
  Report,
  ReportExportType,
  ReportGranularity,
  ReportParams,
} from '../../api/reports';
import { useAuth } from '../../context/AuthContext';
import { InventoryItem } from '../../types';
import { daysAgoIso, formatMoney, formatQty, todayIso } from '../../utils/format';

type RangePreset = 'today' | '7' | '30' | '90' | 'custom';

const inputClass = 'border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500';

function shortDate(value: string): string {
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export const ReportsPage: React.FC = () => {
  const { shop } = useAuth();
  const [preset, setPreset] = React.useState<RangePreset>('30');
  const [from, setFrom] = React.useState(daysAgoIso(30));
  const [to, setTo] = React.useState(todayIso());
  const [itemId, setItemId] = React.useState('');
  const [granularity, setGranularity] = React.useState<ReportGranularity>('day');
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [report, setReport] = React.useState<Report | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [exporting, setExporting] = React.useState(false);
  const [exportType, setExportType] = React.useState<ReportExportType>('sales');
  const [error, setError] = React.useState('');
  const [exportError, setExportError] = React.useState('');
  const requestSequence = React.useRef(0);
  const money = (value: number) => formatMoney(value, shop?.currency || 'INR');

  React.useEffect(() => {
    let active = true;
    api.get<{ success: boolean; items: InventoryItem[] }>('/items', { params: { activeOnly: 'true' } })
      .then((response) => { if (active) setItems(response.data.items || []); })
      .catch(() => { if (active) setItems([]); });
    return () => { active = false; };
  }, []);

  const load = React.useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError('');
    if (from > to) {
      setError('The start date must be on or before the end date.');
      setLoading(false);
      return;
    }
    try {
      const params: ReportParams = { from, to, granularity, ...(itemId ? { itemId } : {}) };
      const next = await getReport(params);
      if (sequence === requestSequence.current) setReport(next);
    } catch (err: any) {
      if (sequence === requestSequence.current) {
        setReport(null);
        setError(err.message || 'Reports could not be loaded.');
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [from, to, itemId, granularity]);

  React.useEffect(() => { void load(); }, [load]);

  const applyPreset = (next: RangePreset) => {
    setPreset(next);
    if (next === 'custom') return;
    const days = next === 'today' ? 1 : Number(next);
    setFrom(daysAgoIso(days));
    setTo(todayIso());
  };

  const exportCsv = async () => {
    if (!report) return;
    setExporting(true);
    setExportError('');
    try {
      const params: ReportParams = { from, to, granularity, ...(itemId ? { itemId } : {}) };
      const blob = await downloadReportCsv(exportType, params);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `shoptea-${exportType}-${from}-to-${to}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setExportError(err.message || 'The CSV export could not be downloaded.');
    } finally {
      setExporting(false);
    }
  };

  const summary = report?.summary;
  const hasSalesTrend = !!report?.trend.some((row) => row.revenue || row.cogs);
  const hasStockTrend = !!report?.trend.some((row) => row.purchaseValue || row.consumptionValue);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports & analytics</h1>
          <p className="text-sm text-slate-500 mt-1">Sales, stock costs, consumption, and current inventory valuation.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold text-slate-600">
            Export
            <select value={exportType} onChange={(event) => setExportType(event.target.value as ReportExportType)} className={`${inputClass} block mt-1 min-w-36`}>
              <option value="sales">Sales</option>
              <option value="purchases">Purchases</option>
              <option value="consumption">Consumption</option>
              <option value="inventory">Inventory valuation</option>
              <option value="movements">Stock movements</option>
            </select>
          </label>
          <button type="button" onClick={exportCsv} disabled={!report || exporting || loading} className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm disabled:opacity-50">
            <Download className="h-4 w-4" /> {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-4 mb-6">
        <div className="flex flex-wrap gap-2 mb-4">
          {(['today', '7', '30', '90', 'custom'] as RangePreset[]).map((value) => (
            <button
              type="button"
              key={value}
              onClick={() => applyPreset(value)}
              className={`px-3 py-1.5 rounded-lg text-sm border ${preset === value ? 'bg-amber-600 text-white border-amber-600' : 'bg-white border-slate-300 text-slate-700'}`}
            >
              {value === 'today' ? 'Today' : value === 'custom' ? 'Custom' : `Last ${value} days`}
            </button>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <label className="text-xs font-semibold text-slate-600">
            From
            <input type="date" value={from} max={to} onChange={(event) => { setFrom(event.target.value); setPreset('custom'); }} className={`${inputClass} block mt-1 w-full`} />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            To
            <input type="date" value={to} min={from} max={todayIso()} onChange={(event) => { setTo(event.target.value); setPreset('custom'); }} className={`${inputClass} block mt-1 w-full`} />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Inventory item
            <select value={itemId} onChange={(event) => setItemId(event.target.value)} className={`${inputClass} block mt-1 w-full`}>
              <option value="">All active items</option>
              {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Trend grouping
            <select value={granularity} onChange={(event) => setGranularity(event.target.value as ReportGranularity)} className={`${inputClass} block mt-1 w-full`}>
              <option value="day">Daily</option>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
            </select>
          </label>
          <button type="button" onClick={load} disabled={loading} className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm disabled:opacity-50 self-end">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Item filtering limits ingredient costs and stock activity. Sales linked to that ingredient retain their full recorded revenue.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center justify-between gap-3">
          <span>{error}</span><button type="button" onClick={load} className="font-semibold">Retry</button>
        </div>
      )}
      {exportError && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{exportError}</div>}

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3" aria-label="Loading reports">
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-32 bg-white border rounded-xl animate-pulse" />)}
        </div>
      ) : !report || !summary ? (
        <div className="bg-white border rounded-xl p-8 text-center text-slate-500">No report data is available for these filters.</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-sm text-slate-600">
            <p><span className="font-semibold">{shortDate(report.range.from)} – {shortDate(report.range.to)}</span> · {report.range.days} days</p>
            <p className="text-xs">Compared with {shortDate(report.previousRange.from)} – {shortDate(report.previousRange.to)}</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            <MetricCard label="Recorded revenue" value={money(summary.revenue)} detail={`${summary.salesCount} active sales`} comparison={report.comparison.revenue} money={money} />
            <MetricCard label="Sale-recipe COGS" value={money(summary.cogs)} detail="Recorded ingredient costs" comparison={report.comparison.cogs} money={money} />
            <MetricCard label="Gross profit" value={summary.grossProfit === null ? 'Unavailable' : money(summary.grossProfit)} detail={summary.reliableCost ? 'Revenue minus recorded COGS' : 'Incomplete sale cost records'} comparison={report.comparison.grossProfit} money={money} unavailable={summary.grossProfit === null} />
            <MetricCard label="Purchases" value={money(summary.purchaseValue)} detail={`${summary.purchaseCount} active purchase movements`} comparison={report.comparison.purchaseValue} money={money} />
            <MetricCard label="Stock consumption" value={money(summary.consumptionValue)} detail={`${summary.consumptionCount} recipe and manual movements`} comparison={report.comparison.consumptionValue} money={money} />
            <MetricCard label="Inventory value now" value={money(summary.inventoryValue)} detail={`${summary.inventoryItemCount} active items · weighted average`} money={money} />
          </div>

          {!summary.reliableCost && (
            <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              Gross profit is withheld because at least one active sale has missing recipe-cost records. No current recipe cost is substituted for historical sales.
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <ChartCard title="Sales, COGS, and gross profit" empty={!hasSalesTrend}>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={report.trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => money(Number(value))} labelFormatter={(label) => shortDate(String(label))} />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#d97706" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="cogs" name="COGS" stroke="#0f766e" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="grossProfit" name="Gross profit" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Purchases and stock consumption" empty={!hasStockTrend}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={report.trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => money(Number(value))} labelFormatter={(label) => shortDate(String(label))} />
                  <Legend />
                  <Bar dataKey="purchaseValue" name="Purchases" fill="#d97706" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="recipeConsumptionValue" name="Recipe usage" fill="#0f766e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="manualConsumptionValue" name="Manual usage" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <ChartCard title="Consumption cost by item" empty={report.consumptionByItem.length === 0}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={report.consumptionByItem.slice(0, 8)} layout="vertical" margin={{ left: 12, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => money(Number(value))} />
                  <Bar dataKey="value" name="Recorded cost" fill="#0f766e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Recorded consumption mix" empty={!summary.consumptionValue}>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={report.trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => money(Number(value))} labelFormatter={(label) => shortDate(String(label))} />
                  <Legend />
                  <Area type="monotone" dataKey="recipeConsumptionValue" name="Recipe usage" stackId="1" stroke="#0f766e" fill="#99f6e4" />
                  <Area type="monotone" dataKey="manualConsumptionValue" name="Manual usage" stackId="1" stroke="#2563eb" fill="#bfdbfe" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <Section title="Consumption by inventory item" empty={report.consumptionByItem.length === 0} emptyText="No stock consumption in this period.">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase text-slate-500 border-b"><th className="py-2">Item</th><th className="py-2 text-right">Quantity</th><th className="py-2 text-right">Recipe</th><th className="py-2 text-right">Manual</th><th className="py-2 text-right">Cost</th></tr></thead>
                  <tbody className="divide-y">
                    {report.consumptionByItem.map((item) => (
                      <tr key={item.itemId}>
                        <td className="py-2 font-medium text-slate-800">{item.name}</td>
                        <td className="py-2 text-right">{formatQty(item.quantity)} {item.unit}</td>
                        <td className="py-2 text-right">{formatQty(item.recipeQuantity)}</td>
                        <td className="py-2 text-right">{formatQty(item.manualQuantity)}</td>
                        <td className="py-2 text-right">{money(item.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
            <Section title="Sales by menu item" empty={report.salesByItem.length === 0} emptyText="No active sales in this period.">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase text-slate-500 border-b"><th className="py-2">Menu item</th><th className="py-2 text-right">Sold</th><th className="py-2 text-right">Revenue</th></tr></thead>
                  <tbody className="divide-y">
                    {report.salesByItem.map((item) => (
                      <tr key={item.menuItemId}>
                        <td className="py-2 font-medium text-slate-800">{item.name}</td>
                        <td className="py-2 text-right">{formatQty(item.quantity)}</td>
                        <td className="py-2 text-right">{money(item.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>

          <Section title="Current inventory valuation" empty={report.inventory.length === 0} emptyText="No active inventory items.">
            <p className="text-xs text-slate-500 mb-3">Current stock × current weighted-average unit cost. This is a live valuation, not a historical period-end balance.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase text-slate-500 border-b"><th className="py-2">Item</th><th className="py-2">Status</th><th className="py-2 text-right">Stock</th><th className="py-2 text-right">Unit cost</th><th className="py-2 text-right">Value</th><th className="py-2">Supplier</th></tr></thead>
                <tbody className="divide-y">
                  {report.inventory.map((item) => (
                    <tr key={item.itemId}>
                      <td className="py-2 font-medium text-slate-800">{item.name}<span className="block text-xs font-normal text-slate-500">{item.category.replace(/_/g, ' ')}</span></td>
                      <td className="py-2"><span className={`text-xs px-2 py-1 rounded-full ${item.status === 'HEALTHY' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{item.status.replace(/_/g, ' ')}</span></td>
                      <td className="py-2 text-right">{formatQty(item.currentStock)} {item.unit}</td>
                      <td className="py-2 text-right">{money(item.unitCost)}</td>
                      <td className="py-2 text-right font-semibold">{money(item.value)}</td>
                      <td className="py-2 text-slate-600">{item.supplier?.name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <div className="mt-6">
            <Section title="Recent stock movements" empty={report.movements.length === 0} emptyText="No stock movements in this period.">
              <p className="text-xs text-slate-500 mb-3">Includes active, cancelled, and reversal records for audit. Up to 500 movements are shown.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase text-slate-500 border-b"><th className="py-2">Date</th><th className="py-2">Item</th><th className="py-2">Type</th><th className="py-2">Status</th><th className="py-2 text-right">Quantity</th><th className="py-2 text-right">Recorded cost</th><th className="py-2">Reference</th></tr></thead>
                  <tbody className="divide-y">
                    {report.movements.slice(0, 20).map((movement) => (
                      <tr key={movement.id}>
                        <td className="py-2 whitespace-nowrap">{shortDate(movement.date)}</td>
                        <td className="py-2 font-medium text-slate-800">{movement.itemName}</td>
                        <td className="py-2">{movement.type}</td>
                        <td className="py-2"><span className={`text-xs px-2 py-1 rounded-full ${movement.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{movement.status}</span></td>
                        <td className="py-2 text-right">{formatQty(movement.quantity)} {movement.unit}</td>
                        <td className="py-2 text-right">{movement.totalCost === null ? '—' : money(movement.totalCost)}</td>
                        <td className="py-2 text-slate-600">{movement.reference || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>
        </>
      )}
    </div>
  );
};

function MetricCard({ label, value, detail, comparison, money, unavailable = false }: {
  label: string;
  value: string;
  detail: string;
  comparison?: MetricComparison;
  money: (value: number) => string;
  unavailable?: boolean;
}) {
  return (
    <div className="bg-white border rounded-xl p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${unavailable ? 'text-slate-500' : 'text-slate-900'}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-1">{detail}</p>
      {comparison && <ComparisonLabel comparison={comparison} money={money} />}
    </div>
  );
}

function ComparisonLabel({ comparison, money }: { comparison: MetricComparison; money: (value: number) => string }) {
  if (comparison.change === null) return <p className="text-xs text-slate-400 mt-2">No comparable prior data</p>;
  const positive = comparison.change > 0;
  const neutral = comparison.change === 0;
  return (
    <p className={`text-xs mt-2 ${neutral ? 'text-slate-500' : positive ? 'text-emerald-700' : 'text-red-700'}`}>
      {positive ? '↑' : neutral ? '→' : '↓'} {comparison.percentChange === null ? money(Math.abs(comparison.change)) : `${Math.abs(comparison.percentChange)}%`} vs prior period
    </p>
  );
}

function ChartCard({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <div className="bg-white border rounded-xl p-5">
      <h2 className="font-semibold mb-4">{title}</h2>
      {empty ? <p className="text-sm text-slate-500 py-16 text-center">No activity to chart for these filters.</p> : children}
    </div>
  );
}

function Section({ title, empty, emptyText, children }: { title: string; empty: boolean; emptyText: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border rounded-xl p-5">
      <h2 className="font-semibold mb-3">{title}</h2>
      {empty ? <p className="text-sm text-slate-500 py-6">{emptyText}</p> : children}
    </div>
  );
}
