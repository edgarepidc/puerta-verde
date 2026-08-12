'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { PRODUCT_UNIT_LABELS, type ProductUnit } from '@puertaverde/shared';

interface ForecastRow {
  branch_product_id: string;
  product_name: string;
  unit: ProductUnit;
  current_stock: number;
  avg_daily_sales: number;
  forecast_demand: number;
  suggested_reorder: number;
  days_until_stockout: number | null;
}

interface TrendPoint {
  date: string;
  quantity: number;
}

interface TopProduct {
  name: string;
  quantity: number;
}

function LineChart({ series }: { series: TrendPoint[] }) {
  const width = 640;
  const height = 180;
  const pad = 24;
  const max = Math.max(...series.map((point) => point.quantity), 1);

  const points = series.map((point, index) => {
    const x = pad + (index / Math.max(series.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - (point.quantity / max) * (height - pad * 2);
    return `${x},${y}`;
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" role="img" aria-label="Tendencia de ventas">
      <polyline
        fill="none"
        stroke="#166534"
        strokeWidth="2.5"
        points={points.join(' ')}
      />
      {series.map((point, index) => {
        const x = pad + (index / Math.max(series.length - 1, 1)) * (width - pad * 2);
        const y = height - pad - (point.quantity / max) * (height - pad * 2);
        if (index % Math.ceil(series.length / 6) !== 0 && index !== series.length - 1) return null;
        return (
          <text key={point.date} x={x} y={height - 6} textAnchor="middle" className="fill-slate-400 text-[10px]">
            {point.date.slice(5)}
          </text>
        );
      })}
    </svg>
  );
}

function BarChart({ products }: { products: TopProduct[] }) {
  const max = Math.max(...products.map((product) => product.quantity), 1);
  return (
    <div className="space-y-2">
      {products.map((product) => (
        <div key={product.name}>
          <div className="mb-1 flex justify-between gap-2 text-sm">
            <span className="truncate font-medium text-slate-800">{product.name}</span>
            <span className="text-slate-500">{product.quantity.toFixed(1)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-700"
              style={{ width: `${Math.max(4, (product.quantity / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ForecastManager({ initialForecast }: { initialForecast: ForecastRow[] }) {
  const [forecast, setForecast] = useState(initialForecast);
  const [horizonDays, setHorizonDays] = useState(7);
  const [trendDays, setTrendDays] = useState(30);
  const [series, setSeries] = useState<TrendPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [insights, setInsights] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshTrends(days = trendDays) {
    const response = await fetch(`/api/forecast/trends?days=${days}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'Error al cargar tendencias');
    setSeries(payload.series ?? []);
    setTopProducts(payload.topProducts ?? []);
  }

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [forecastResponse] = await Promise.all([
        fetch(`/api/forecast?days=${horizonDays}`).then(async (response) => {
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error ?? 'Error al cargar');
          return payload;
        }),
        refreshTrends(trendDays),
      ]);
      setForecast(forecastResponse.forecast);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  async function generateInsights() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ horizonDays }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Error al generar');
      setForecast(payload.forecast);
      setInsights(payload.insights);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshTrends(30).catch(() => {
      /* ignore first-load chart errors; table still useful */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const urgent = forecast.filter(
    (r) => Number(r.suggested_reorder) > 0 || (r.days_until_stockout != null && r.days_until_stockout <= 3),
  );

  const totalTrend = useMemo(
    () => series.reduce((sum, point) => sum + point.quantity, 0),
    [series],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="font-medium text-slate-700">Horizonte reposición (días)</span>
          <input
            type="number"
            min={1}
            max={30}
            className="pv-input mt-1 block w-24"
            value={horizonDays}
            onChange={(e) => setHorizonDays(Number(e.target.value))}
          />
        </label>
        <label className="text-sm">
          <span className="font-medium text-slate-700">Tendencia (días)</span>
          <select
            className="pv-input mt-1 block"
            value={trendDays}
            onChange={(e) => setTrendDays(Number(e.target.value))}
          >
            <option value={14}>14</option>
            <option value={30}>30</option>
            <option value={60}>60</option>
          </select>
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={refresh}
          className="rounded-full border border-slate-300 px-4 py-2 text-sm"
        >
          Actualizar
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={generateInsights}
          className="pv-btn-primary px-4 py-2 text-sm"
        >
          {loading ? 'Analizando...' : 'Generar recomendaciones IA'}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="pv-glass-card p-5">
          <h2 className="font-semibold text-slate-900">Ventas por día</h2>
          <p className="text-sm text-slate-500">
            Últimos {trendDays} días · total {totalTrend.toFixed(1)} unidades
          </p>
          <div className="mt-3">
            {series.length > 0 ? (
              <LineChart series={series} />
            ) : (
              <p className="py-10 text-sm text-slate-500">Aún no hay ventas en el periodo.</p>
            )}
          </div>
        </section>
        <section className="pv-glass-card p-5">
          <h2 className="font-semibold text-slate-900">Qué más se vende</h2>
          <p className="mb-3 text-sm text-slate-500">Prioriza comprar lo que se mueve más</p>
          {topProducts.length > 0 ? (
            <BarChart products={topProducts} />
          ) : (
            <p className="py-10 text-sm text-slate-500">Sin datos de productos todavía.</p>
          )}
        </section>
      </div>

      {insights && (
        <section className="pv-callout rounded-2xl p-5">
          <h2 className="font-semibold text-green-900">Recomendaciones</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-green-800">{insights}</p>
          <p className="mt-2 text-xs text-green-700">
            Basado en promedio de ventas de 14 días. Configura FORECAST_OPENAI_API_KEY para análisis con IA.
          </p>
        </section>
      )}

      <section className="pv-glass-card">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Reposición sugerida</h2>
          <p className="text-sm text-slate-500">{urgent.length} productos requieren atención</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-2">Producto</th>
                <th className="px-4 py-2">Stock</th>
                <th className="px-4 py-2">Venta/día</th>
                <th className="px-4 py-2">Demanda {horizonDays}d</th>
                <th className="px-4 py-2">Reponer</th>
                <th className="px-4 py-2">Días restantes</th>
                <th className="px-4 py-2">Comprar</th>
              </tr>
            </thead>
            <tbody>
              {forecast.map((row) => (
                <tr
                  key={row.branch_product_id}
                  className={`border-t border-slate-100 ${
                    Number(row.suggested_reorder) > 0 ||
                    (row.days_until_stockout != null && row.days_until_stockout <= 3)
                      ? 'bg-amber-50/60'
                      : ''
                  }`}
                >
                  <td className="px-4 py-2 font-medium">{row.product_name}</td>
                  <td className="px-4 py-2">
                    {Number(row.current_stock).toFixed(1)} {PRODUCT_UNIT_LABELS[row.unit]}
                  </td>
                  <td className="px-4 py-2">{Number(row.avg_daily_sales).toFixed(2)}</td>
                  <td className="px-4 py-2">{Number(row.forecast_demand).toFixed(1)}</td>
                  <td className="px-4 py-2 font-semibold text-[var(--pv-green-800)]">
                    {Number(row.suggested_reorder).toFixed(1)}
                  </td>
                  <td className="px-4 py-2">
                    {row.days_until_stockout != null ? `~${row.days_until_stockout}` : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/compras?product=${row.branch_product_id}&tab=compra`}
                      className="text-xs font-medium text-emerald-800 underline"
                    >
                      Comprar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
