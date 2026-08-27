'use client';

import { useMemo, useState } from 'react';

import {
  formatMoney,
  OPERATING_COST_PERIOD_LABELS,
  OPERATING_COST_TYPE_LABELS,
  OPERATING_COST_PERIODS,
  OPERATING_COST_TYPES,
  type OperatingCostInput,
  type OperatingCostPeriod,
  type OperatingCostType,
  type ProductUnit,
} from '@puertaverde/shared';

import { DecimalInput, parseDecimal } from '@/components/DecimalInput';
import {
  currentMexicoMonthRange,
  previousMexicoMonthRange,
  todayMexicoYmd,
} from '@/lib/mexico-date';

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
  visit_expenses: number;
  operating_costs_total: number;
  estimated_net_profit: number;
  order_count: number;
}

interface VisitExpenseRow {
  id: string;
  concept: string;
  amount: number;
  expense_date: string;
  notes: string | null;
}

interface CategoryProfitRow {
  category_name: string;
  product_count: number;
  units_sold: number;
  revenue: number;
  cogs: number;
  gross_profit: number;
  gross_margin_percent: number;
}

type PeriodPreset = 'current' | 'previous' | 'custom';

const emptyCost: OperatingCostInput = {
  name: '',
  costType: 'fixed',
  period: 'monthly',
  amount: 0,
  notes: '',
  isActive: true,
};

type BadgeTone = 'green' | 'amber' | 'leaf' | 'blue' | 'slate' | 'orange' | 'indigo' | 'profit' | 'loss';

const BADGE_TONES: Record<BadgeTone, string> = {
  green: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  leaf: 'bg-lime-100 text-lime-800',
  blue: 'bg-sky-100 text-sky-800',
  slate: 'bg-slate-100 text-slate-700',
  orange: 'bg-orange-100 text-orange-800',
  indigo: 'bg-indigo-100 text-indigo-800',
  profit: 'bg-emerald-100 text-emerald-800',
  loss: 'bg-rose-100 text-rose-800',
};

const PRESET_LABELS: Record<PeriodPreset, string> = {
  current: 'Mes en curso',
  previous: 'Mes anterior',
  custom: 'Personalizado',
};

function MetricCard({
  emoji,
  tone,
  label,
  value,
  hint,
}: {
  emoji: string;
  tone: BadgeTone;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="pv-glass-card flex gap-3 p-4">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl ${BADGE_TONES[tone]}`}
        aria-hidden
      >
        {emoji}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-xl font-bold text-slate-900">{value}</p>
        {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
}

function detectPreset(from: string, to: string): PeriodPreset {
  const current = currentMexicoMonthRange();
  if (from === current.start && to === current.end) return 'current';
  const previous = previousMexicoMonthRange();
  if (from === previous.start && to === previous.end) return 'previous';
  return 'custom';
}

function qs(from: string, to: string): string {
  return `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}

export function ProfitabilityManager({
  periodLabel,
  initialFrom,
  initialTo,
  initialMargins,
  initialCosts,
  initialVisitExpenses,
  initialSummary,
  initialCategories,
}: {
  periodLabel: string;
  initialFrom: string;
  initialTo: string;
  initialMargins: MarginRow[];
  initialCosts: CostRow[];
  initialVisitExpenses: VisitExpenseRow[];
  initialSummary: ProfitSummary | null;
  initialCategories: CategoryProfitRow[];
}) {
  const [margins, setMargins] = useState(initialMargins);
  const [costs, setCosts] = useState(initialCosts);
  const [visitExpenses, setVisitExpenses] = useState(initialVisitExpenses);
  const [summary, setSummary] = useState(initialSummary);
  const [categories, setCategories] = useState(initialCategories);
  const [activePeriodLabel, setActivePeriodLabel] = useState(periodLabel);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [preset, setPreset] = useState<PeriodPreset>(() => detectPreset(initialFrom, initialTo));
  const [costForm, setCostForm] = useState(emptyCost);
  const [costAmountText, setCostAmountText] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingPeriod, setLoadingPeriod] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllMargins, setShowAllMargins] = useState(false);

  const today = todayMexicoYmd();

  const totals = useMemo(() => {
    const inventoryCost = margins.reduce((s, r) => s + Number(r.inventory_value_cost), 0);
    const inventorySale = margins.reduce((s, r) => s + Number(r.inventory_value_sale), 0);
    const avgMargin =
      margins.length > 0
        ? margins.reduce((s, r) => s + Number(r.margin_percent), 0) / margins.length
        : 0;
    return { inventoryCost, inventorySale, avgMargin };
  }, [margins]);

  const categoryMaxProfit = useMemo(
    () => Math.max(...categories.map((c) => Math.abs(Number(c.gross_profit))), 1),
    [categories],
  );

  const sortedMargins = useMemo(
    () => [...margins].sort((a, b) => Number(b.margin_percent) - Number(a.margin_percent)),
    [margins],
  );

  const visibleMargins = showAllMargins ? sortedMargins : sortedMargins.slice(0, 12);
  const marginBarMax = useMemo(
    () => Math.max(...sortedMargins.map((m) => Math.abs(Number(m.margin_percent))), 1),
    [sortedMargins],
  );

  const costBreakdown = useMemo(() => {
    const cogs = Number(summary?.cogs ?? 0);
    const fixed = Number(summary?.fixed_costs ?? 0);
    const visit = Number(summary?.visit_expenses ?? 0);
    const variableTotal = Number(summary?.variable_costs ?? 0);
    const configuredVariable = Math.max(variableTotal - visit, 0);
    const total = cogs + fixed + configuredVariable + visit;
    const segments = [
      { key: 'cogs', label: 'Lo vendido', emoji: '🥕', amount: cogs, color: 'bg-amber-400' },
      { key: 'fixed', label: 'Fijos', emoji: '🏠', amount: fixed, color: 'bg-slate-400' },
      {
        key: 'variable',
        label: 'Variables config.',
        emoji: '🛍️',
        amount: configuredVariable,
        color: 'bg-orange-400',
      },
      { key: 'visit', label: 'Gastos visita', emoji: '🛻', amount: visit, color: 'bg-sky-400' },
    ].filter((s) => s.amount > 0);
    return {
      total,
      segments: segments.map((s) => ({
        ...s,
        percent: total > 0 ? (s.amount / total) * 100 : 0,
      })),
    };
  }, [summary]);

  async function loadPeriod(nextFrom: string, nextTo: string) {
    setLoadingPeriod(true);
    setError(null);
    try {
      const query = qs(nextFrom, nextTo);
      const [marginsRes, costsRes, profitRes, categoriesRes, expensesRes] = await Promise.all([
        fetch('/api/margins'),
        fetch('/api/costs'),
        fetch(`/api/profit?${query}`),
        fetch(`/api/profit/categories?${query}`),
        fetch(`/api/expenses?${query}`),
      ]);
      const marginsPayload = await marginsRes.json();
      const costsPayload = await costsRes.json();
      const profitPayload = await profitRes.json();
      const categoriesPayload = await categoriesRes.json();
      const expensesPayload = await expensesRes.json();
      if (!marginsRes.ok) throw new Error(marginsPayload.error ?? 'Error márgenes');
      if (!costsRes.ok) throw new Error(costsPayload.error ?? 'Error costos');
      if (!profitRes.ok) throw new Error(profitPayload.error ?? 'Error utilidad');
      if (!categoriesRes.ok) throw new Error(categoriesPayload.error ?? 'Error categorías');
      if (!expensesRes.ok) throw new Error(expensesPayload.error ?? 'Error gastos de visita');
      setMargins(marginsPayload.margins);
      setCosts(costsPayload.costs);
      setSummary(profitPayload.summary);
      setCategories(categoriesPayload.categories);
      setVisitExpenses(expensesPayload.expenses ?? []);
      setFrom(profitPayload.from ?? nextFrom);
      setTo(profitPayload.to ?? nextTo);
      setActivePeriodLabel(profitPayload.periodLabel ?? activePeriodLabel);
      setPreset(detectPreset(profitPayload.from ?? nextFrom, profitPayload.to ?? nextTo));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoadingPeriod(false);
    }
  }

  function applyPreset(next: PeriodPreset) {
    setPreset(next);
    if (next === 'current') {
      const range = currentMexicoMonthRange();
      setFrom(range.start);
      setTo(range.end);
      void loadPeriod(range.start, range.end);
      return;
    }
    if (next === 'previous') {
      const range = previousMexicoMonthRange();
      setFrom(range.start);
      setTo(range.end);
      void loadPeriod(range.start, range.end);
      return;
    }
  }

  async function addCost() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...costForm,
          amount: parseDecimal(costAmountText),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar');
      setCostForm(emptyCost);
      setCostAmountText('');
      await loadPeriod(from, to);
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
    await loadPeriod(from, to);
  }

  async function removeCost(id: string) {
    if (!confirm('¿Eliminar este costo?')) return;
    await fetch(`/api/costs/${id}`, { method: 'DELETE' });
    await loadPeriod(from, to);
  }

  const net = summary ? Number(summary.estimated_net_profit) : 0;
  const netPositive = net >= 0;
  const exportQuery = qs(from, to);

  return (
    <div className="space-y-8">
      <section className="pv-glass-card space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {(['current', 'previous', 'custom'] as PeriodPreset[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => applyPreset(key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  preset === key
                    ? 'bg-emerald-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {PRESET_LABELS[key]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={loadingPeriod}
              onClick={() => loadPeriod(from, to)}
              className="rounded-full border border-slate-300 px-2.5 py-1 text-xs text-slate-700 disabled:opacity-50"
            >
              {loadingPeriod ? 'Cargando…' : 'Actualizar'}
            </button>
            <a
              href={`/api/export/profit?${exportQuery}`}
              className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              Excel
            </a>
            <a
              href={`/api/export/profit/pdf?${exportQuery}`}
              className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              PDF
            </a>
          </div>
        </div>
        <p className="text-sm text-slate-600">{activePeriodLabel}</p>

        {preset === 'custom' && (
          <div className="flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-3">
            <label className="text-xs font-medium text-slate-600">
              Desde
              <input
                type="date"
                max={today}
                className="pv-input mt-1 block text-sm"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Hasta
              <input
                type="date"
                max={today}
                className="pv-input mt-1 block text-sm"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={loadingPeriod}
              onClick={() => loadPeriod(from, to)}
              className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Aplicar rango
            </button>
          </div>
        )}
      </section>

      {summary && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            emoji="🧺"
            tone="green"
            label="Ventas del periodo"
            value={formatMoney(Number(summary.revenue))}
            hint="Lo que entró a caja"
          />
          <MetricCard
            emoji="🥕"
            tone="amber"
            label="COGS"
            value={formatMoney(Number(summary.cogs))}
            hint="Costo de lo vendido"
          />
          <MetricCard
            emoji="🌿"
            tone="leaf"
            label="Utilidad bruta"
            value={formatMoney(Number(summary.gross_profit))}
            hint="Ventas − COGS"
          />
          <MetricCard
            emoji="📊"
            tone="blue"
            label="Margen bruto"
            value={`${Number(summary.gross_margin_percent).toFixed(1)}%`}
            hint="Salud del margen"
          />
          <MetricCard
            emoji="🏠"
            tone="slate"
            label="Costos fijos"
            value={formatMoney(Number(summary.fixed_costs))}
            hint={
              preset === 'custom'
                ? 'Prorrateados si el rango no es mes desde el día 1'
                : 'Monto completo del mes'
            }
          />
          <MetricCard
            emoji="🛍️"
            tone="orange"
            label="Costos variables"
            value={formatMoney(Number(summary.variable_costs))}
            hint="Gastos de las compras"
          />
          <MetricCard
            emoji="🧾"
            tone="indigo"
            label="Pedidos"
            value={String(summary.order_count)}
            hint="Tickets no cancelados"
          />
          <MetricCard
            emoji={netPositive ? '💚' : '⚠️'}
            tone={netPositive ? 'profit' : 'loss'}
            label="Utilidad estimada"
            value={formatMoney(net)}
            hint="Tras costos operativos"
          />
        </section>
      )}

      <section className="pv-glass-card">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Utilidad por categoría</h2>
          <p className="text-sm text-slate-500">
            Barras por utilidad bruta · {activePeriodLabel}
          </p>
        </div>

        {categories.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">Sin ventas en el periodo.</p>
        ) : (
          <div className="space-y-4 px-5 py-5">
            {categories.map((row) => {
              const profit = Number(row.gross_profit);
              const width = Math.max((Math.abs(profit) / categoryMaxProfit) * 100, 4);
              const positive = profit >= 0;
              return (
                <div key={row.category_name}>
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium text-slate-900">{row.category_name}</span>
                    <span className="text-slate-600">
                      {formatMoney(profit)}
                      <span className="ml-2 text-xs text-slate-400">
                        {Number(row.gross_margin_percent).toFixed(1)}% · {formatMoney(Number(row.revenue))} ventas
                      </span>
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all ${
                        positive ? 'bg-emerald-500' : 'bg-rose-400'
                      }`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {row.product_count} productos · {Number(row.units_sold).toFixed(1)} unidades
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {categories.length > 0 && (
          <details className="border-t border-slate-100">
            <summary className="cursor-pointer px-5 py-3 text-xs font-medium text-slate-500 hover:text-slate-700">
              Ver tabla detallada
            </summary>
            <div className="overflow-x-auto pb-3">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-2">Categoría</th>
                    <th className="px-4 py-2">Productos</th>
                    <th className="px-4 py-2">Unidades</th>
                    <th className="px-4 py-2">Ingresos</th>
                    <th className="px-4 py-2">COGS</th>
                    <th className="px-4 py-2">Utilidad bruta</th>
                    <th className="px-4 py-2">Margen %</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((row) => (
                    <tr key={`t-${row.category_name}`} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-medium">{row.category_name}</td>
                      <td className="px-4 py-2">{row.product_count}</td>
                      <td className="px-4 py-2">{Number(row.units_sold).toFixed(2)}</td>
                      <td className="px-4 py-2">{formatMoney(Number(row.revenue))}</td>
                      <td className="px-4 py-2">{formatMoney(Number(row.cogs))}</td>
                      <td className="px-4 py-2 font-semibold">{formatMoney(Number(row.gross_profit))}</td>
                      <td className="px-4 py-2">{Number(row.gross_margin_percent).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>

      <section className="pv-glass-card">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Márgenes por producto</h2>
          <p className="text-sm text-slate-500">
            Inventario a costo {formatMoney(totals.inventoryCost)} · a venta {formatMoney(totals.inventorySale)} ·
            margen promedio {totals.avgMargin.toFixed(1)}%
          </p>
        </div>

        {sortedMargins.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">Sin productos con margen.</p>
        ) : (
          <div className="px-5 py-5">
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleMargins.map((row) => {
                const pct = Number(row.margin_percent);
                const width = Math.max((Math.abs(pct) / marginBarMax) * 100, 3);
                const healthy = pct >= 15;
                return (
                  <div
                    key={row.branch_product_id}
                    className="rounded-xl border border-slate-100 bg-slate-50/70 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-sm font-medium leading-snug text-slate-900">
                        {row.product_name}
                      </p>
                      <span
                        className={`shrink-0 text-sm font-bold ${
                          healthy ? 'text-emerald-700' : 'text-rose-600'
                        }`}
                      >
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white ring-1 ring-slate-100">
                      <div
                        className={`h-full rounded-full ${healthy ? 'bg-emerald-500' : 'bg-amber-400'}`}
                        style={{ width: `${Math.min(width, 100)}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      {formatMoney(Number(row.sale_price))} · costo {formatMoney(Number(row.avg_unit_cost))}
                    </p>
                  </div>
                );
              })}
            </div>
            {sortedMargins.length > 12 && (
              <button
                type="button"
                onClick={() => setShowAllMargins((v) => !v)}
                className="mt-4 text-xs font-semibold text-emerald-800 hover:underline"
              >
                {showAllMargins ? 'Ver menos' : `Ver todos (${sortedMargins.length})`}
              </button>
            )}
          </div>
        )}
      </section>

      <section className="pv-glass-card p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900">Costos del periodo</h2>
        <p className="mt-1 text-sm text-slate-500">
          Costo de lo vendido, fijos y gastos de visita. Lo comprado y no vendido sigue en inventario.
        </p>

        {summary && costBreakdown.total > 0 && (
          <div className="mt-5 space-y-4">
            <div className="flex h-7 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-100">
              {costBreakdown.segments.map((seg) => (
                <div
                  key={seg.key}
                  className={`${seg.color} relative flex h-full items-center justify-center first:rounded-l-full last:rounded-r-full`}
                  style={{ width: `${Math.max(seg.percent, 0.8)}%` }}
                  title={`${seg.label}: ${formatMoney(seg.amount)} (${seg.percent.toFixed(1)}%)`}
                >
                  {seg.percent >= 7 ? (
                    <span className="text-[10px] font-bold text-white drop-shadow-sm">
                      {seg.percent.toFixed(0)}%
                    </span>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {(['cogs', 'fixed', 'visit'] as const).map((key) => {
                const seg = costBreakdown.segments.find((s) => s.key === key) ?? {
                  key,
                  label: key === 'cogs' ? 'Lo vendido' : key === 'fixed' ? 'Fijos' : 'Gastos visita',
                  emoji: key === 'cogs' ? '🥕' : key === 'fixed' ? '🏠' : '🛻',
                  amount: 0,
                  color: key === 'cogs' ? 'bg-amber-400' : key === 'fixed' ? 'bg-slate-400' : 'bg-sky-400',
                  percent: 0,
                };
                return (
                  <div key={key} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3">
                    <p className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${seg.color}`} aria-hidden />
                        <span aria-hidden>{seg.emoji}</span>
                        {seg.label}
                      </span>
                      <span className="shrink-0 text-sm font-bold normal-case tracking-normal text-slate-900">
                        {formatMoney(seg.amount)}
                      </span>
                    </p>
                  </div>
                );
              })}
            </div>

            {costBreakdown.segments.some((s) => s.key === 'variable') && (
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="inline-block h-2 w-2 rounded-full bg-orange-400" aria-hidden />
                + Variables configurados{' '}
                {formatMoney(costBreakdown.segments.find((s) => s.key === 'variable')!.amount)} (
                {costBreakdown.segments.find((s) => s.key === 'variable')!.percent.toFixed(0)}%)
              </p>
            )}
          </div>
        )}

        <details className="mt-5 rounded-xl border border-slate-100">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Gastos de visita
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {visitExpenses.length} registro{visitExpenses.length === 1 ? '' : 's'} ·{' '}
                  {formatMoney(Number(summary?.visit_expenses ?? 0))}
                </span>
              </span>
              <span className="text-xs font-semibold text-emerald-800">Ver detalle</span>
            </span>
          </summary>
          {visitExpenses.length === 0 ? (
            <p className="border-t border-slate-100 px-4 py-4 text-sm text-slate-500">
              Sin gastos de visita en este periodo.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {visitExpenses.map((expense) => (
                <li
                  key={expense.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
                >
                  <div>
                    <p className="font-medium text-slate-900">{expense.concept}</p>
                    <p className="text-xs text-slate-500">
                      {expense.expense_date}
                      {expense.notes ? ` · ${expense.notes}` : ''}
                    </p>
                  </div>
                  <p className="font-semibold text-slate-800">{formatMoney(Number(expense.amount))}</p>
                </li>
              ))}
            </ul>
          )}
        </details>

        <div className="mt-6 border-t border-slate-100 pt-5">
          <h3 className="text-sm font-semibold text-slate-800">Costos fijos y variables configurados</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Renta, nómina, etc. Los fijos mensuales van al 100% en mes en curso / mes anterior; en rango
            personalizado se prorratean.
          </p>

          <ul className="mt-3 divide-y divide-slate-100">
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
              className="pv-input"
              value={costForm.name}
              onChange={(e) => setCostForm((f) => ({ ...f, name: e.target.value }))}
            />
            <DecimalInput
              placeholder="Monto"
              className="pv-input"
              value={costAmountText}
              onChange={setCostAmountText}
            />
            <select
              className="pv-input"
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
              className="pv-input"
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
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
