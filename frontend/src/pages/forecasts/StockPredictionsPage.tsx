import React from 'react';
import { Link } from 'react-router-dom';
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDownRight, ArrowUpRight, Minus, RefreshCw } from 'lucide-react';
import { api } from '../../api/client';
import {
  Forecast,
  ForecastDataQuality,
  ForecastParams,
  ForecastTrend,
  getForecast,
  ItemForecast,
} from '../../api/forecasts';
import { useAuth } from '../../context/AuthContext';
import { InventoryItem } from '../../types';
import { formatMoney, formatQty } from '../../utils/format';

const inputClass = 'border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500';

function shortDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function fullDate(value: string | null): string {
  if (!value) return '—';
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const StockPredictionsPage: React.FC = () => {
  const { shop } = useAuth();
  const [historyDays, setHistoryDays] = React.useState(30);
  const [forecastDays, setForecastDays] = React.useState(7);
  const [windowDays, setWindowDays] = React.useState(7);
  const [safetyBufferDays, setSafetyBufferDays] = React.useState(2);
  const [itemId, setItemId] = React.useState('');
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [forecast, setForecast] = React.useState<Forecast | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
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
    try {
      const params: ForecastParams = { historyDays, forecastDays, windowDays, safetyBufferDays, ...(itemId ? { itemId } : {}) };
      const next = await getForecast(params);
      if (sequence === requestSequence.current) setForecast(next);
    } catch (err: any) {
      if (sequence === requestSequence.current) {
        setForecast(null);
        setError(err.message || 'Stock predictions could not be loaded.');
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [historyDays, forecastDays, windowDays, safetyBufferDays, itemId]);

  React.useEffect(() => { void load(); }, [load]);

  const focusedItem = forecast?.items.find((item) => item.itemId === itemId) || forecast?.items[0] || null;
  const salesChart = forecast ? [
    ...forecast.salesForecast.history.map((row) => ({ date: row.date, actual: row.revenue, predicted: null })),
    ...(forecast.salesForecast.prediction?.dailyForecast.map((row) => ({ date: row.date, actual: null, predicted: row.revenue })) || []),
  ] : [];
  const consumptionChart = focusedItem ? [
    ...focusedItem.history.dates.map((date, index) => ({ date, actual: focusedItem.history.quantities[index], predicted: null })),
    ...(focusedItem.prediction?.dailyForecast.map((row) => ({ date: row.date, actual: null, predicted: row.quantity })) || []),
  ] : [];
  const rankedItems = forecast ? [...forecast.items].sort((a, b) => {
    if (!a.prediction && !b.prediction) return a.name.localeCompare(b.name);
    if (!a.prediction) return 1;
    if (!b.prediction) return -1;
    return b.prediction.suggestedPurchaseQty - a.prediction.suggestedPurchaseQty;
  }) : [];

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Stock predictions</h1>
          <p className="text-sm text-slate-500 mt-1">Exact recorded totals with transparent, backend-calculated moving-average estimates.</p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm disabled:opacity-50 self-start">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh predictions
        </button>
      </div>

      <div className="bg-white border rounded-xl p-4 mb-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <label className="text-xs font-semibold text-slate-600">
            Historical period
            <select value={historyDays} onChange={(event) => setHistoryDays(Number(event.target.value))} className={`${inputClass} block mt-1 w-full`}>
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Prediction period
            <select value={forecastDays} onChange={(event) => setForecastDays(Number(event.target.value))} className={`${inputClass} block mt-1 w-full`}>
              <option value={7}>Next 7 days</option>
              <option value={14}>Next 14 days</option>
              <option value={30}>Next 30 days</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Moving-average window
            <select value={windowDays} onChange={(event) => setWindowDays(Number(event.target.value))} className={`${inputClass} block mt-1 w-full`}>
              <option value={3}>3 days</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Safety buffer
            <select value={safetyBufferDays} onChange={(event) => setSafetyBufferDays(Number(event.target.value))} className={`${inputClass} block mt-1 w-full`}>
              <option value={0}>No buffer</option>
              <option value={2}>2 days</option>
              <option value={5}>5 days</option>
              <option value={7}>7 days</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Inventory item
            <select value={itemId} onChange={(event) => setItemId(event.target.value)} className={`${inputClass} block mt-1 w-full`}>
              <option value="">All active items</option>
              {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Model: weighted moving average, not a trained AI model. Zero-activity days are included; cancelled records are excluded.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center justify-between gap-3">
          <span>{error}</span><button type="button" onClick={load} className="font-semibold">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3" aria-label="Loading stock predictions">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 bg-white border rounded-xl animate-pulse" />)}
        </div>
      ) : !forecast ? (
        <div className="bg-white border rounded-xl p-8 text-center text-slate-500">No prediction data is available.</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-sm text-slate-600">
            <p>History: <span className="font-semibold">{fullDate(forecast.historyRange.from)} – {fullDate(forecast.historyRange.to)}</span></p>
            <p>Forecast: <span className="font-semibold">{fullDate(forecast.forecastRange.from)} – {fullDate(forecast.forecastRange.to)}</span></p>
          </div>

          <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm">
            <span className="font-semibold">Actual vs predicted:</span> the cards below are exact recorded values. Charts and reorder recommendations are statistical estimates. {forecast.model.disclaimer}
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <ExactCard label="Recorded sales revenue" value={money(forecast.exact.salesRevenue)} detail={`${forecast.exact.salesCount} active sales`} />
            <ExactCard label="Recorded purchases" value={money(forecast.exact.purchaseValue)} detail={`${forecast.exact.purchaseCount} active purchase movements`} />
            <ExactCard label="Recorded consumption" value={money(forecast.exact.consumptionValue)} detail={`${forecast.exact.consumptionMovementCount} active usage movements`} />
            <ExactCard label="Inventory value now" value={money(forecast.exact.inventoryValue)} detail={`${forecast.exact.inventoryItemCount} active items`} />
          </div>

          <div className="grid lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2 bg-white border rounded-xl p-5">
              <h2 className="font-semibold mb-1">Sales revenue: recorded history and forecast</h2>
              <p className="text-xs text-slate-500 mb-4">Solid line = actual recorded sales. Dashed line = predicted revenue.</p>
              {salesChart.length === 0 ? (
                <p className="text-sm text-slate-500 py-16 text-center">No sales history is available.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={salesChart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => money(Number(value))} labelFormatter={(label) => fullDate(String(label))} />
                    <Legend />
                    <Line type="monotone" dataKey="actual" name="Recorded revenue" stroke="#d97706" strokeWidth={2} dot={false} connectNulls={false} />
                    <Line type="monotone" dataKey="predicted" name="Predicted revenue" stroke="#2563eb" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="bg-white border rounded-xl p-5">
              <div className="flex items-center justify-between gap-2 mb-4">
                <h2 className="font-semibold">Sales forecast</h2>
                <QualityBadge quality={forecast.salesForecast.dataQuality} />
              </div>
              {forecast.salesForecast.prediction ? (
                <>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Predicted revenue</p>
                  <p className="text-2xl font-bold text-blue-700 mb-1">{money(forecast.salesForecast.prediction.predictedRevenue)}</p>
                  <p className="text-sm text-slate-600 mb-4">{formatQty(forecast.salesForecast.prediction.predictedSalesCount)} predicted sales</p>
                  <div className="border-t pt-3 text-sm">
                    <div className="flex justify-between gap-2 py-1"><span className="text-slate-500">Historical revenue</span><span>{money(forecast.salesForecast.historicalRevenue)}</span></div>
                    <div className="flex justify-between gap-2 py-1"><span className="text-slate-500">Weighted daily average</span><span>{money(forecast.salesForecast.historicalAverageDailyRevenue)}</span></div>
                    <div className="flex justify-between gap-2 py-1"><span className="text-slate-500">Trend</span><TrendLabel trend={forecast.salesForecast.trend} percent={forecast.salesForecast.trendPercentChange} /></div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-amber-800 bg-amber-50 p-3 rounded-lg">{forecast.salesForecast.qualityMessage}</p>
              )}
            </div>
          </div>

          {focusedItem && (
            <div className="bg-white border rounded-xl p-5 mb-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <h2 className="font-semibold">{focusedItem.name}: consumption history and forecast</h2>
                <QualityBadge quality={focusedItem.dataQuality} />
              </div>
              <p className="text-xs text-slate-500 mb-4">Quantities use this item's base unit ({focusedItem.unit}). Wastage and adjustments are not treated as demand.</p>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={consumptionChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => `${formatQty(Number(value))} ${focusedItem.unit}`} labelFormatter={(label) => fullDate(String(label))} />
                  <Legend />
                  <Line type="monotone" dataKey="actual" name="Recorded usage" stroke="#0f766e" strokeWidth={2} dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="predicted" name="Predicted usage" stroke="#2563eb" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="bg-white border rounded-xl p-5 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="font-semibold">Ingredient forecasts and reorder recommendations</h2>
                <p className="text-xs text-slate-500 mt-1">Ranked by suggested purchase quantity. Actual stock remains the database value.</p>
              </div>
              <div className="flex gap-2 text-xs">
                <QualityBadge quality="GOOD" label={`Good ${forecast.dataQualityCounts.GOOD}`} />
                <QualityBadge quality="LIMITED" label={`Limited ${forecast.dataQualityCounts.LIMITED}`} />
                <QualityBadge quality="INSUFFICIENT" label={`Insufficient ${forecast.dataQualityCounts.INSUFFICIENT}`} />
              </div>
            </div>
            {rankedItems.length === 0 ? (
              <p className="text-sm text-slate-500 py-6">No active inventory items are available for forecasting.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[1000px]">
                  <thead>
                    <tr className="text-left text-xs uppercase text-slate-500 border-b">
                      <th className="py-2">Item</th><th className="py-2 text-right">Actual stock</th><th className="py-2 text-right">Avg. usage/day</th><th className="py-2">Trend</th><th className="py-2 text-right">Predicted usage</th><th className="py-2">Est. stock-out</th><th className="py-2">Suggested reorder</th><th className="py-2 text-right">Suggested qty</th><th className="py-2 text-right">Est. cost</th><th className="py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rankedItems.map((item) => <ForecastRow key={item.itemId} item={item} money={money} />)}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white border rounded-xl p-5 text-sm text-slate-600">
            <h2 className="font-semibold text-slate-900 mb-2">How recommendations are calculated</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Daily usage is weighted toward recent days within the selected {windowDays}-day window; days with zero usage remain in the series.</li>
              <li>Safety stock = average daily usage × {safetyBufferDays} buffer days. Reorder point = the greater of minimum stock or lead-time demand plus safety stock.</li>
              <li>Suggested quantity fills to the greater of target stock or demand covering supplier lead time, the {forecastDays}-day prediction period, and the safety buffer, less current stock.</li>
              <li>At least three active days are required for a prediction; fewer than seven is marked limited. Missing history never produces a fabricated forecast.</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
};

function ExactCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="bg-white border rounded-xl p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{detail}</p>
      <p className="text-[11px] font-semibold text-emerald-700 mt-2">ACTUAL RECORDED VALUE</p>
    </div>
  );
}

function ForecastRow({ item, money }: { item: ItemForecast; money: (value: number) => string }) {
  const prediction = item.prediction;
  return (
    <tr>
      <td className="py-3 pr-3">
        <p className="font-medium text-slate-900">{item.name}</p>
        <p className="text-xs text-slate-500">{item.category.replace(/_/g, ' ')} · lead time {item.leadTimeDays}d</p>
        <div className="mt-1"><QualityBadge quality={item.dataQuality} /></div>
      </td>
      <td className="py-3 text-right align-top">{formatQty(item.currentStock)} {item.unit}</td>
      <td className="py-3 text-right align-top">{formatQty(item.historicalAverageDailyConsumption)} {item.unit}</td>
      <td className="py-3 align-top"><TrendLabel trend={item.trend} percent={item.trendPercentChange} /></td>
      <td className="py-3 text-right align-top">{prediction ? `${formatQty(prediction.predictedConsumption)} ${item.unit}` : '—'}</td>
      <td className="py-3 align-top">{fullDate(prediction?.estimatedStockOutDate || null)}{prediction?.daysUntilStockOut !== null && prediction?.daysUntilStockOut !== undefined ? <span className="block text-xs text-slate-500">{formatQty(prediction.daysUntilStockOut)} days</span> : null}</td>
      <td className="py-3 align-top">{fullDate(prediction?.suggestedReorderDate || null)}{prediction ? <span className="block text-xs text-slate-500">Point {formatQty(prediction.reorderPoint)} {item.unit}</span> : null}</td>
      <td className="py-3 text-right align-top font-semibold">{prediction ? `${formatQty(prediction.suggestedPurchaseQty)} ${item.unit}` : 'Need more data'}</td>
      <td className="py-3 text-right align-top">{prediction ? money(prediction.estimatedPurchaseCost) : '—'}</td>
      <td className="py-3 pl-3 align-top">{prediction && prediction.suggestedPurchaseQty > 0 ? <Link to={`/purchases/new?itemId=${item.itemId}`} className="text-amber-700 font-semibold whitespace-nowrap">Record purchase</Link> : '—'}</td>
    </tr>
  );
}

function QualityBadge({ quality, label }: { quality: ForecastDataQuality; label?: string }) {
  const classes = quality === 'GOOD'
    ? 'bg-emerald-100 text-emerald-800'
    : quality === 'LIMITED'
      ? 'bg-amber-100 text-amber-800'
      : 'bg-slate-200 text-slate-700';
  return <span className={`inline-block text-[11px] font-semibold px-2 py-1 rounded-full ${classes}`}>{label || quality}</span>;
}

function TrendLabel({ trend, percent }: { trend: ForecastTrend; percent: number | null }) {
  const content = trend === 'INCREASING'
    ? <><ArrowUpRight className="h-4 w-4" /> Increasing</>
    : trend === 'DECREASING'
      ? <><ArrowDownRight className="h-4 w-4" /> Decreasing</>
      : trend === 'STABLE'
        ? <><Minus className="h-4 w-4" /> Stable</>
        : <>Insufficient data</>;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${trend === 'INCREASING' ? 'text-amber-700' : trend === 'DECREASING' ? 'text-emerald-700' : 'text-slate-600'}`}>
      {content}{percent !== null ? ` (${percent > 0 ? '+' : ''}${percent}%)` : null}
    </span>
  );
}
