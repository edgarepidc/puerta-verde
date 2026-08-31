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

import { ActionChip, ChevronDownIcon, FoldableSummary } from '@/components/ActionChip';
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

const PRESET_EMOJI: Record<PeriodPreset, string> = {
  current: '📅',
  previous: '📆',
  custom: '✏️',
};

function formatShortRange(from: string, to: string): string {
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  const month = (date: Date) =>
    date.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '').toLowerCase();
  const yy = (date: Date) => String(date.getFullYear()).slice(-2);
  if (from === to) return `${start.getDate()} ${month(start)} ${yy(start)}`;
  if (from.slice(0, 7) === to.slice(0, 7)) {
    return `${start.getDate()}–${end.getDate()} ${month(start)} ${yy(start)}`;
  }
  return `${start.getDate()} ${month(start)} – ${end.getDate()} ${month(end)} ${yy(end)}`;
}

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
  const [openUtilidad, setOpenUtilidad] = useState(true);
  const [openMargenes, setOpenMargenes] = useState(false);
  const [openGastos, setOpenGastos] = useState(false);

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
      { key: 'cogs', label: 'Mercancía vendida', emoji: '🥕', amount: cogs, color: 'bg-amber-400' },
      { key: 'fixed', label: 'Gastos fijos', emoji: '🏠', amount: fixed, color: 'bg-slate-400' },
      {
        key: 'variable',
        label: 'Otros gastos',
        emoji: '🛍️',
        amount: configuredVariable,
        color: 'bg-orange-400',
      },
      { key: 'visit', label: 'Gastos de visita', emoji: '🛻', amount: visit, color: 'bg-sky-400' },
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

  const inventorySpread = totals.inventorySale - totals.inventoryCost;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <MetricCard
          emoji="📦"
          tone="slate"
          label="Inventario a costo"
          value={formatMoney(totals.inventoryCost)}
          hint="Lo que pagaste por lo que hay"
        />
        <MetricCard
          emoji="🏷️"
          tone="leaf"
          label="Inventario a venta"
          value={formatMoney(totals.inventorySale)}
          hint={
            inventorySpread >= 0
              ? `Al precio de lista · ${formatMoney(inventorySpread)} de margen`
              : 'Al precio de lista'
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <MetricCard
          emoji="📅"
          tone="blue"
          label="Periodo"
          value={formatShortRange(from, to)}
          hint={PRESET_LABELS[preset]}
        />
        <MetricCard
          emoji="🧺"
          tone="green"
          label="Vendiste"
          value={formatMoney(Number(summary?.revenue ?? 0))}
          hint={`${summary?.order_count ?? 0} ticket${summary?.order_count === 1 ? '' : 's'}`}
        />
        <MetricCard
          emoji="🧾"
          tone="amber"
          label="Te costó"
          value={formatMoney(
            Number(summary?.cogs ?? 0) + Number(summary?.operating_costs_total ?? 0),
          )}
          hint="Mercancía vendida + gastos"
        />
        <MetricCard
          emoji={netPositive ? '💚' : '⚠️'}
          tone={netPositive ? 'profit' : 'loss'}
          label="Te quedó"
          value={formatMoney(net)}
          hint={netPositive ? 'Después de mercancía y gastos' : 'Este periodo quedó abajo'}
        />
      </div>

      <details
        className="group pv-glass-card space-y-4 p-4 sm:p-6"
        open={openUtilidad}
        onToggle={(event) => setOpenUtilidad(event.currentTarget.open)}
      >
        <FoldableSummary
          title="Utilidad"
          hint={`Por categoría · ${activePeriodLabel}`}
          emoji="📊"
          iconClass="bg-violet-100"
          actions={
            <>
              <ActionChip emoji="🔄" disabled={loadingPeriod} onClick={() => void loadPeriod(from, to)}>
                {loadingPeriod ? 'Cargando…' : 'Actualizar'}
              </ActionChip>
              <a href={`/api/export/profit?${exportQuery}`}>
                <ActionChip as="span" emoji="📗">
                  Excel
                </ActionChip>
              </a>
              <a href={`/api/export/profit/pdf?${exportQuery}`}>
                <ActionChip as="span" emoji="📄">
                  PDF
                </ActionChip>
              </a>
            </>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          {(['current', 'previous', 'custom'] as PeriodPreset[]).map((key) => (
            <ActionChip
              key={key}
              emoji={PRESET_EMOJI[key]}
              tone={preset === key ? 'emerald' : 'slate'}
              elevated={preset === key}
              onClick={() => applyPreset(key)}
            >
              {PRESET_LABELS[key]}
            </ActionChip>
          ))}
        </div>

        {preset === 'custom' ? (
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
            <ActionChip emoji="📅" disabled={loadingPeriod} onClick={() => void loadPeriod(from, to)}>
              Aplicar rango
            </ActionChip>
          </div>
        ) : null}

        {categories.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Sin ventas en el periodo.</p>
        ) : (
          <div className="space-y-4">
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

        {categories.length > 0 ? (
          <details className="group rounded-xl border border-slate-100">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
              <p className="text-sm font-medium text-slate-800">Tabla detallada</p>
              <ActionChip as="span" icon={<ChevronDownIcon />} className="shrink-0">
                <span className="group-open:hidden">Desplegar</span>
                <span className="hidden group-open:inline">Cerrar</span>
              </ActionChip>
            </summary>
            <div className="overflow-x-auto border-t border-slate-100 pb-3">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-2">Categoría</th>
                    <th className="px-4 py-2">Productos</th>
                    <th className="px-4 py-2">Unidades</th>
                    <th className="px-4 py-2">Ingresos</th>
                    <th className="px-4 py-2">Costo</th>
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
        ) : null}
      </details>

      <details
        className="group pv-glass-card space-y-4 p-4 sm:p-6"
        open={openMargenes}
        onToggle={(event) => setOpenMargenes(event.currentTarget.open)}
      >
        <FoldableSummary
          title="Márgenes por producto"
          hint={`Margen promedio ${totals.avgMargin.toFixed(1)}%`}
          emoji="🥬"
          iconClass="bg-emerald-100"
        />

        {sortedMargins.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Sin productos con margen.</p>
        ) : (
          <div>
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
            {sortedMargins.length > 12 ? (
              <ActionChip
                className="mt-4"
                emoji="📋"
                onClick={() => setShowAllMargins((v) => !v)}
              >
                {showAllMargins ? 'Ver menos' : `Ver todos (${sortedMargins.length})`}
              </ActionChip>
            ) : null}
          </div>
        )}
      </details>

      <details
        className="group pv-glass-card min-w-0 space-y-4 overflow-hidden p-4 sm:p-6"
        open={openGastos}
        onToggle={(event) => setOpenGastos(event.currentTarget.open)}
      >
        <FoldableSummary
          title="Gastos del mes"
          hint="Mercancía vendida, renta y gastos de visita. Lo comprado y no vendido sigue en inventario."
          emoji="🧾"
          iconClass="bg-amber-100"
        />

        {summary && costBreakdown.total > 0 ? (
          <div className="space-y-4">
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
                  label: key === 'cogs' ? 'Mercancía vendida' : key === 'fixed' ? 'Gastos fijos' : 'Gastos de visita',
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
                + Otros gastos{' '}
                {formatMoney(costBreakdown.segments.find((s) => s.key === 'variable')!.amount)} (
                {costBreakdown.segments.find((s) => s.key === 'variable')!.percent.toFixed(0)}%)
              </p>
            )}
          </div>
        ) : null}

        <details className="group rounded-xl border border-slate-100">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
            <p className="text-sm font-medium text-slate-800">
              Gastos de visita
              <span className="ml-2 text-xs font-normal text-slate-500">
                {visitExpenses.length} registro{visitExpenses.length === 1 ? '' : 's'} ·{' '}
                {formatMoney(Number(summary?.visit_expenses ?? 0))}
              </span>
            </p>
            <ActionChip as="span" icon={<ChevronDownIcon />} className="shrink-0">
              <span className="group-open:hidden">Desplegar</span>
              <span className="hidden group-open:inline">Cerrar</span>
            </ActionChip>
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

        <div>
          <h3 className="text-sm font-semibold text-slate-800">Renta, nómina y otros</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Gastos fijos del local. En el mes en curso o el anterior se cuenta el monto completo; en un
            rango a modo se prorratea.
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
                <div className="flex flex-wrap gap-2">
                  <ActionChip
                    elevated={false}
                    emoji={row.is_active ? '⏸️' : '▶️'}
                    onClick={() => void toggleCost(row)}
                  >
                    {row.is_active ? 'Desactivar' : 'Activar'}
                  </ActionChip>
                  <ActionChip
                    elevated={false}
                    tone="rose"
                    emoji="🗑️"
                    onClick={() => void removeCost(row.id)}
                  >
                    Eliminar
                  </ActionChip>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-6 min-w-0 rounded-xl bg-slate-50 p-4">
            <div className="grid min-w-0 grid-cols-2 items-center gap-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.55fr)_7.5rem_8.5rem_auto]">
              <input
                placeholder="Nombre"
                className="pv-input min-w-0 col-span-2 lg:col-span-1"
                value={costForm.name}
                onChange={(e) => setCostForm((f) => ({ ...f, name: e.target.value }))}
              />
              <DecimalInput
                placeholder="Monto"
                className="pv-input min-w-0"
                groupThousands
                value={costAmountText}
                onChange={setCostAmountText}
              />
              <select
                className="pv-input min-w-0"
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
                className="pv-input min-w-0"
                value={costForm.period}
                onChange={(e) => setCostForm((f) => ({ ...f, period: e.target.value as OperatingCostPeriod }))}
              >
                {OPERATING_COST_PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {OPERATING_COST_PERIOD_LABELS[p]}
                  </option>
                ))}
              </select>
              <div className="col-span-2 flex justify-end lg:col-span-1">
                <ActionChip emoji="🧾" disabled={saving} onClick={addCost}>
                  Agregar costo
                </ActionChip>
              </div>
            </div>
          </div>
        </div>
      </details>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
