'use client';

import { useMemo, useState } from 'react';

import {
  formatMoney,
  OPERATING_COST_PERIOD_LABELS,
  OPERATING_COST_TYPE_LABELS,
  OPERATING_COST_PERIODS,
  OPERATING_COST_TYPES,
  PRODUCT_UNIT_LABELS,
  type OperatingCostInput,
  type OperatingCostPeriod,
  type OperatingCostType,
  type ProductUnit,
} from '@puertaverde/shared';

interface MarginRow {
  branch_product_id: string;
  product_name: string;
  unit: ProductUnit;
  sale_price: number;
  avg_unit_cost: number;
  last_unit_cost: number | null;
  margin_amount: number;
  margin_percent: number;
  stock: number;
  inventory_value_cost: number;
  inventory_value_sale: number;
}

interface CostRow {
  id: string;
  name: string;
  cost_type: OperatingCostType;
  period: OperatingCostPeriod;
  amount: number;
  notes: string | null;
  is_active: boolean;
}

interface ProfitSummary {
  period_days: number;
  revenue: number;
  cogs: number;
  gross_profit: number;
  gross_margin_percent: number;
  fixed_costs: number;
  variable_costs: number;
  operating_costs_total: number;
  estimated_net_profit: number;
  order_count: number;
}

const emptyCost: OperatingCostInput = {
  name: '',
  costType: 'fixed',
  period: 'monthly',
  amount: 0,
  notes: '',
  isActive: true,
};

export function ProfitabilityManager({
  initialMargins,
  initialCosts,
  initialSummary,
}: {
  initialMargins: MarginRow[];
  initialCosts: CostRow[];
  initialSummary: ProfitSummary | null;
}) {
  const [margins, setMargins] = useState(initialMargins);
  const [costs, setCosts] = useState(initialCosts);
  const [summary, setSummary] = useState(initialSummary);
  const [days, setDays] = useState(30);
  const [costForm, setCostForm] = useState(emptyCost);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => {
    const inventoryCost = margins.reduce((s, r) => s + Number(r.inventory_value_cost), 0);
    const inventorySale = margins.reduce((s, r) => s + Number(r.inventory_value_sale), 0);
    const avgMargin =
      margins.length > 0
        ? margins.reduce((s, r) => s + Number(r.margin_percent), 0) / margins.length
        : 0;
    return { inventoryCost, inventorySale, avgMargin };
  }, [margins]);

  async function refreshAll() {
    const [marginsRes, costsRes, profitRes] = await Promise.all([
      fetch('/api/margins'),
      fetch('/api/costs'),
      fetch(`/api/profit?days=${days}`),
    ]);
    const marginsPayload = await marginsRes.json();
    const costsPayload = await costsRes.json();
    const profitPayload = await profitRes.json();
    if (!marginsRes.ok) throw new Error(marginsPayload.error ?? 'Error márgenes');
    if (!costsRes.ok) throw new Error(costsPayload.error ?? 'Error costos');
    if (!profitRes.ok) throw new Error(profitPayload.error ?? 'Error utilidad');
    setMargins(marginsPayload.margins);
    setCosts(costsPayload.costs);
    setSummary(profitPayload.summary);
  }

  async function addCost() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(costForm),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar');
      setCostForm(emptyCost);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleCost(row: CostRow) {
    await fetch(`/api/costs/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !row.is_active }),
    });
    await refreshAll();
  }

  async function removeCost(id: string) {
    if (!confirm('¿Eliminar este costo?')) return;
    await fetch(`/api/costs/${id}`, { method: 'DELETE' });
    await refreshAll();
  }

  return (
    <div className="space-y-8">
      {summary && (
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Ventas (periodo)', value: formatMoney(Number(summary.revenue)) },
            { label: 'Costo de mercancía', value: formatMoney(Number(summary.cogs)) },
            { label: 'Utilidad bruta', value: formatMoney(Number(summary.gross_profit)) },
            { label: 'Utilidad estimada', value: formatMoney(Number(summary.estimated_net_profit)) },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{card.value}</p>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="font-medium text-slate-700">Periodo de análisis (días)</span>
            <input
              type="number"
              min={1}
              max={90}
              className="mt-1 block w-24 rounded-xl border border-slate-200 px-3 py-2"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            onClick={() => refreshAll().catch((e) => setError(String(e)))}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm"
          >
            Actualizar utilidad
          </button>
        </div>
        {summary && (
          <p className="mt-3 text-sm text-slate-600">
            Margen bruto {summary.gross_margin_percent}% · Costos fijos {formatMoney(Number(summary.fixed_costs))} ·
            variables {formatMoney(Number(summary.variable_costs))} · {summary.order_count} pedidos
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Márgenes por producto</h2>
          <p className="text-sm text-slate-500">
            Inventario a costo {formatMoney(totals.inventoryCost)} · a venta {formatMoney(totals.inventorySale)} ·
            margen promedio {totals.avgMargin.toFixed(1)}%
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-2">Producto</th>
                <th className="px-4 py-2">Costo prom.</th>
                <th className="px-4 py-2">Último costo</th>
                <th className="px-4 py-2">Precio venta</th>
                <th className="px-4 py-2">Margen $</th>
                <th className="px-4 py-2">Margen %</th>
              </tr>
            </thead>
            <tbody>
              {margins.map((row) => (
                <tr key={row.branch_product_id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium">
                    {row.product_name}
                    <span className="ml-1 text-xs text-slate-400">
                      ({PRODUCT_UNIT_LABELS[row.unit]})
                    </span>
                  </td>
                  <td className="px-4 py-2">{formatMoney(Number(row.avg_unit_cost))}</td>
                  <td className="px-4 py-2">
                    {row.last_unit_cost != null ? formatMoney(Number(row.last_unit_cost)) : '—'}
                  </td>
                  <td className="px-4 py-2">{formatMoney(Number(row.sale_price))}</td>
                  <td className="px-4 py-2">{formatMoney(Number(row.margin_amount))}</td>
                  <td
                    className={`px-4 py-2 font-semibold ${
                      Number(row.margin_percent) < 15 ? 'text-red-600' : 'text-green-700'
                    }`}
                  >
                    {Number(row.margin_percent).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Costos fijos y variables</h2>
        <p className="mt-1 text-sm text-slate-500">
          Ej. renta (fijo mensual), bolsas (variable por pedido), nómina (fijo mensual).
        </p>

        <ul className="mt-4 divide-y divide-slate-100">
          {costs.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-medium text-slate-900">
                  {row.name}{' '}
                  <span className="text-slate-500">
                    · {OPERATING_COST_TYPE_LABELS[row.cost_type]} · {OPERATING_COST_PERIOD_LABELS[row.period]}
                  </span>
                </p>
                <p className="text-slate-600">
                  {formatMoney(Number(row.amount))}
                  {!row.is_active && ' · inactivo'}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => toggleCost(row)} className="rounded-lg border px-3 py-1">
                  {row.is_active ? 'Desactivar' : 'Activar'}
                </button>
                <button type="button" onClick={() => removeCost(row.id)} className="rounded-lg border px-3 py-1">
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-6 grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-2">
          <input
            placeholder="Nombre (ej. Renta local)"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={costForm.name}
            onChange={(e) => setCostForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            type="number"
            min={0}
            step={0.01}
            placeholder="Monto"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={costForm.amount}
            onChange={(e) => setCostForm((f) => ({ ...f, amount: Number(e.target.value) }))}
          />
          <select
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={costForm.costType}
            onChange={(e) => setCostForm((f) => ({ ...f, costType: e.target.value as OperatingCostType }))}
          >
            {OPERATING_COST_TYPES.map((t) => (
              <option key={t} value={t}>
                {OPERATING_COST_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={costForm.period}
            onChange={(e) => setCostForm((f) => ({ ...f, period: e.target.value as OperatingCostPeriod }))}
          >
            {OPERATING_COST_PERIODS.map((p) => (
              <option key={p} value={p}>
                {OPERATING_COST_PERIOD_LABELS[p]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={saving}
            onClick={addCost}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white md:col-span-2"
          >
            Agregar costo
          </button>
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
