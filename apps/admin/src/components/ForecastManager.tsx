'use client';

import { useState } from 'react';

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

export function ForecastManager({ initialForecast }: { initialForecast: ForecastRow[] }) {
  const [forecast, setForecast] = useState(initialForecast);
  const [horizonDays, setHorizonDays] = useState(7);
  const [insights, setInsights] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/forecast?days=${horizonDays}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Error al cargar');
      setForecast(payload.forecast);
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

  const urgent = forecast.filter(
    (r) => Number(r.suggested_reorder) > 0 || (r.days_until_stockout != null && r.days_until_stockout <= 3),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="font-medium text-slate-700">Horizonte (días)</span>
          <input
            type="number"
            min={1}
            max={30}
            className="mt-1 block w-24 rounded-xl border border-slate-200 px-3 py-2"
            value={horizonDays}
            onChange={(e) => setHorizonDays(Number(e.target.value))}
          />
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
          className="rounded-full bg-[var(--pv-green-700)] px-4 py-2 text-sm font-semibold text-white"
        >
          {loading ? 'Analizando...' : 'Generar recomendaciones IA'}
        </button>
      </div>

      {insights && (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-5">
          <h2 className="font-semibold text-green-900">Recomendaciones</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-green-800">{insights}</p>
          <p className="mt-2 text-xs text-green-700">
            Basado en promedio de ventas de 14 días. Configura FORECAST_OPENAI_API_KEY para análisis con IA.
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
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
              </tr>
            </thead>
            <tbody>
              {forecast.map((row) => (
                <tr key={row.branch_product_id} className="border-t border-slate-100">
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
