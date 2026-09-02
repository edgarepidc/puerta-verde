'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  formatDecimal,
  formatMoney,
  INCOME_ENTRY_TYPE_HINTS,
  INCOME_ENTRY_TYPE_LABELS,
  MONEY_POCKET_LABELS,
  OPERATING_COST_PERIOD_LABELS,
  OPERATING_COST_TYPE_LABELS,
  OPERATING_COST_PERIODS,
  OPERATING_COST_TYPES,
  costAppliesToRange,
  parseMoneyPocket,
  type IncomeEntryType,
  type MoneyPocket,
  type MoneyPositionView,
  type OperatingCostInput,
  type OperatingCostPeriod,
  type OperatingCostTerm,
  type OperatingCostType,
  type ProductUnit,
} from '@puertaverde/shared';

import { ActionChip, FoldableSummary, NestedFoldChip } from '@/components/ActionChip';
import { MoneyPocketField } from '@/components/MoneyPocketField';
import {
  PeriodSalesCharts,
  type PaymentRow,
  type TopProduct,
  type TrendPoint,
  type WeekdayRow,
} from '@/components/PeriodSalesCharts';
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
  paid_from?: MoneyPocket | null;
  terms?: OperatingCostTerm[];
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
  other_income?: number;
  contributions?: number;
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
  paid_from?: MoneyPocket | null;
}

interface IncomeRow {
  id: string;
  entry_type: IncomeEntryType;
  concept: string;
  amount: number;
  entry_date: string;
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
  paidFrom: 'account',
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

function TeQuedoCard({
  net,
  netPositive,
  position,
  adjusting,
  cashText,
  accountText,
  saving,
  onCashText,
  onAccountText,
  onToggleAdjust,
  onSave,
  canAdjust,
}: {
  net: number;
  netPositive: boolean;
  position: MoneyPositionView | null;
  adjusting: boolean;
  cashText: string;
  accountText: string;
  saving: boolean;
  onCashText: (value: string) => void;
  onAccountText: (value: string) => void;
  onToggleAdjust: () => void;
  onSave: () => void;
  canAdjust: boolean;
}) {
  return (
    <div className="pv-glass-card flex gap-3 p-4">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl ${
          netPositive ? BADGE_TONES.profit : BADGE_TONES.loss
        }`}
        aria-hidden
      >
        {netPositive ? '💚' : '⚠️'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Te quedó</p>
          {canAdjust && !adjusting ? (
            <button
              type="button"
              className="shrink-0 text-[11px] font-semibold text-slate-500 hover:text-slate-800"
              onClick={onToggleAdjust}
            >
              Ajustar
            </button>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xl font-bold text-slate-900">{formatMoney(net)}</p>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          En caja {formatMoney(position?.cash ?? 0)} · En cuenta {formatMoney(position?.account ?? 0)}
        </p>
        {canAdjust && adjusting ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-xs font-medium text-slate-600">
              Caja
              <DecimalInput
                className="pv-input mt-1"
                groupThousands
                value={cashText}
                onChange={onCashText}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Cuenta
              <DecimalInput
                className="pv-input mt-1"
                groupThousands
                value={accountText}
                onChange={onAccountText}
              />
            </label>
            <div className="col-span-2 flex flex-wrap gap-2">
              <ActionChip emoji="💾" disabled={saving} onClick={onSave}>
                {saving ? 'Guardando…' : 'Guardar conteo'}
              </ActionChip>
              <ActionChip elevated={false} onClick={onToggleAdjust}>
                Cancelar
              </ActionChip>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ProfitBuildUp({ summary }: { summary: ProfitSummary | null }) {
  if (!summary) return null;

  const revenue = Number(summary.revenue);
  const cogs = Number(summary.cogs);
  const fixed = Number(summary.fixed_costs);
  const visit = Number(summary.visit_expenses);
  const other = Math.max(Number(summary.variable_costs) - visit, 0);
  const otherIncome = Number(summary.other_income ?? 0);
  const contributions = Number(summary.contributions ?? 0);
  const net = Number(summary.estimated_net_profit);
  const netPositive = net >= 0;
  const operatingNet = net - contributions;
  const operatingNetPositive = operatingNet >= 0;
  const gross = Number(summary.gross_profit ?? revenue - cogs);
  const grossPct =
    revenue > 0 ? Number(summary.gross_margin_percent ?? (gross / revenue) * 100) : null;
  const netPct = revenue > 0 ? (operatingNet / revenue) * 100 : null;

  const formatPct = (value: number | null) =>
    value == null ? '—' : `${value.toFixed(1).replace(/^-/, '−')}%`;

  let running = revenue;
  const steps: Array<{
    key: string;
    label: string;
    hint?: string;
    delta: number;
    running: number;
  }> = [
    { key: 'in', label: 'Entró · ventas', delta: revenue, running },
  ];

  running -= cogs;
  steps.push({
    key: 'cogs',
    label: '− Mercancía vendida',
    hint: 'Costo de lo que sí se vendió, no el inventario',
    delta: -cogs,
    running,
  });
  running -= fixed;
  steps.push({
    key: 'fixed',
    label: '− Gastos fijos',
    hint: 'Renta, nómina y otros del local',
    delta: -fixed,
    running,
  });
  running -= visit;
  steps.push({
    key: 'visit',
    label: '− Gastos de visita',
    hint: 'Gasolina, diablero, caseta…',
    delta: -visit,
    running,
  });
  if (other > 0) {
    running -= other;
    steps.push({
      key: 'other',
      label: '− Otros gastos',
      delta: -other,
      running,
    });
  }
  if (otherIncome > 0) {
    running += otherIncome;
    steps.push({
      key: 'income',
      label: '+ Otros ingresos',
      hint: 'Reembolsos o ventas sueltas.',
      delta: otherIncome,
      running,
    });
  }
  if (contributions > 0) {
    running += contributions;
    steps.push({
      key: 'capital',
      label: '+ Aportaciones',
      hint: 'Capital que metiste a la cuenta.',
      delta: contributions,
      running,
    });
  }

  return (
    <section className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 sm:p-5">
      <h3 className="text-base font-semibold text-slate-900">Cálculo de utilidad</h3>
      <p className="mt-0.5 text-sm text-slate-500">De lo que entró a lo que quedó, paso a paso.</p>
      <ul className="mt-3 divide-y divide-slate-100">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">{step.label}</p>
              {step.hint ? <p className="text-xs text-slate-500">{step.hint}</p> : null}
            </div>
            <div className="shrink-0 text-right tabular-nums">
              <p
                className={`text-sm font-semibold ${
                  step.delta < 0 ? 'text-slate-600' : 'text-slate-900'
                }`}
              >
                {formatMoney(step.delta)}
              </p>
              {index > 0 ? (
                <p className="text-[11px] text-slate-400">van {formatMoney(step.running)}</p>
              ) : null}
            </div>
          </li>
        ))}
        <li className="flex items-baseline justify-between gap-3 border-t-2 border-slate-200 pt-3">
          <p className="text-sm font-semibold text-slate-900">= Utilidad neta</p>
          <p
            className={`text-lg font-bold tabular-nums ${
              netPositive ? 'text-emerald-800' : 'text-rose-700'
            }`}
          >
            {formatMoney(net)}
          </p>
        </li>
      </ul>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Margen bruto
          </p>
          <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">{formatPct(grossPct)}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatMoney(gross)} · después de mercancía
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Margen neto
          </p>
          <p
            className={`mt-0.5 text-xl font-bold tabular-nums ${
              operatingNetPositive ? 'text-emerald-800' : 'text-rose-700'
            }`}
          >
            {formatPct(netPct)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatMoney(operatingNet)}
            {contributions > 0 ? ' · del negocio, sin el capital' : ' · después de gastos'}
          </p>
        </div>
      </div>
    </section>
  );
}

function CashSquare({
  revenue,
  contributions,
  otherIncome,
  purchases,
  visit,
  inventoryCost,
}: {
  revenue: number;
  contributions: number;
  otherIncome: number;
  purchases: number;
  visit: number;
  inventoryCost: number;
}) {
  const inflow = revenue + contributions + otherIncome;
  const outflow = purchases + visit;
  return (
    <section className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
      <h3 className="text-sm font-semibold text-slate-900">Para cuadrar</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        Efectivo del periodo, no la utilidad. Las compras de inventario no son un gasto.
      </p>
      <ul className="mt-3 space-y-2.5 text-sm">
        <li className="flex items-baseline justify-between gap-3">
          <span className="min-w-0">
            <span className="font-medium text-slate-800">Entró</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Ventas {formatMoney(revenue)}
              {contributions > 0 ? ` · aportaciones ${formatMoney(contributions)}` : ''}
              {otherIncome > 0 ? ` · otros ${formatMoney(otherIncome)}` : ''}
            </span>
          </span>
          <span className="shrink-0 font-semibold tabular-nums text-slate-900">
            {formatMoney(inflow)}
          </span>
        </li>
        <li className="flex items-baseline justify-between gap-3">
          <span className="min-w-0">
            <span className="font-medium text-slate-800">Salió</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Compras {formatMoney(purchases)} · visita {formatMoney(visit)}
            </span>
          </span>
          <span className="shrink-0 font-semibold tabular-nums text-slate-900">
            {formatMoney(outflow)}
          </span>
        </li>
        <li className="flex items-baseline justify-between gap-3 border-t border-emerald-100 pt-2.5">
          <span className="min-w-0">
            <span className="font-medium text-slate-800">Sigue en mercancía</span>
            <span className="mt-0.5 block text-xs text-slate-500">Inventario a costo</span>
          </span>
          <span className="shrink-0 font-semibold tabular-nums text-slate-900">
            {formatMoney(inventoryCost)}
          </span>
        </li>
      </ul>
    </section>
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
  initialIncomes,
  initialPurchasesTotal,
  initialMoneyPosition,
  initialSummary,
  initialCategories,
  canAdjustMoney,
}: {
  periodLabel: string;
  initialFrom: string;
  initialTo: string;
  initialMargins: MarginRow[];
  initialCosts: CostRow[];
  initialVisitExpenses: VisitExpenseRow[];
  initialIncomes: IncomeRow[];
  initialPurchasesTotal: number;
  initialMoneyPosition: MoneyPositionView | null;
  initialSummary: ProfitSummary | null;
  initialCategories: CategoryProfitRow[];
  canAdjustMoney: boolean;
}) {
  const [margins, setMargins] = useState(initialMargins);
  const [costs, setCosts] = useState(initialCosts);
  const [visitExpenses, setVisitExpenses] = useState(initialVisitExpenses);
  const [incomes, setIncomes] = useState(initialIncomes);
  const [purchasesTotal, setPurchasesTotal] = useState(initialPurchasesTotal);
  const [summary, setSummary] = useState(initialSummary);
  const [categories, setCategories] = useState(initialCategories);
  const [activePeriodLabel, setActivePeriodLabel] = useState(periodLabel);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [preset, setPreset] = useState<PeriodPreset>(() => detectPreset(initialFrom, initialTo));
  const [costForm, setCostForm] = useState(emptyCost);
  const [costAmountText, setCostAmountText] = useState('');
  const [incomeType, setIncomeType] = useState<IncomeEntryType>('contribution');
  const [incomeConcept, setIncomeConcept] = useState('');
  const [incomeAmountText, setIncomeAmountText] = useState('');
  const [incomeDate, setIncomeDate] = useState(() => todayMexicoYmd());
  const [incomeNotes, setIncomeNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingPeriod, setLoadingPeriod] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllMargins, setShowAllMargins] = useState(false);
  const [openVentas, setOpenVentas] = useState(false);
  const [openUtilidad, setOpenUtilidad] = useState(false);
  const [openMargenes, setOpenMargenes] = useState(false);
  const [openGastos, setOpenGastos] = useState(false);
  const [openMovimientos, setOpenMovimientos] = useState(false);
  const [series, setSeries] = useState<TrendPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [topWeekdays, setTopWeekdays] = useState<WeekdayRow[]>([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState<PaymentRow[]>([]);
  const [moneyPosition, setMoneyPosition] = useState<MoneyPositionView | null>(initialMoneyPosition);
  const [adjustingPockets, setAdjustingPockets] = useState(false);
  const [cashAdjustText, setCashAdjustText] = useState('');
  const [accountAdjustText, setAccountAdjustText] = useState('');
  const [editVisit, setEditVisit] = useState<{
    id: string;
    concept: string;
    amount: string;
    expenseDate: string;
    notes: string;
    paidFrom: MoneyPocket;
  } | null>(null);
  const [editIncome, setEditIncome] = useState<{
    id: string;
    entryType: IncomeEntryType;
    concept: string;
    amount: string;
    entryDate: string;
    notes: string;
  } | null>(null);
  const [editCost, setEditCost] = useState<{
    id: string;
    name: string;
    amount: string;
    costType: OperatingCostType;
    period: OperatingCostPeriod;
    paidFrom: MoneyPocket;
  } | null>(null);

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

  async function applyTrends(payload: {
    series?: TrendPoint[];
    topProducts?: TopProduct[];
    topWeekdays?: WeekdayRow[];
    paymentBreakdown?: PaymentRow[];
  }) {
    setSeries(payload.series ?? []);
    setTopProducts(payload.topProducts ?? []);
    setTopWeekdays(payload.topWeekdays ?? []);
    setPaymentBreakdown(payload.paymentBreakdown ?? []);
  }

  async function loadPeriod(nextFrom: string, nextTo: string) {
    setLoadingPeriod(true);
    setError(null);
    try {
      const query = qs(nextFrom, nextTo);
      const [marginsRes, costsRes, profitRes, categoriesRes, expensesRes, incomesRes, trendsRes, moneyRes] =
        await Promise.all([
          fetch('/api/margins'),
          fetch('/api/costs'),
          fetch(`/api/profit?${query}`),
          fetch(`/api/profit/categories?${query}`),
          fetch(`/api/expenses?${query}`),
          fetch(`/api/incomes?${query}`),
          fetch(`/api/forecast/trends?${query}`),
          fetch(`/api/money-position?${query}`),
        ]);
      const marginsPayload = await marginsRes.json();
      const costsPayload = await costsRes.json();
      const profitPayload = await profitRes.json();
      const categoriesPayload = await categoriesRes.json();
      const expensesPayload = await expensesRes.json();
      const incomesPayload = await incomesRes.json();
      const trendsPayload = await trendsRes.json();
      const moneyPayload = await moneyRes.json();
      if (!marginsRes.ok) throw new Error(marginsPayload.error ?? 'Error márgenes');
      if (!costsRes.ok) throw new Error(costsPayload.error ?? 'Error costos');
      if (!profitRes.ok) throw new Error(profitPayload.error ?? 'Error utilidad');
      if (!categoriesRes.ok) throw new Error(categoriesPayload.error ?? 'Error categorías');
      if (!expensesRes.ok) throw new Error(expensesPayload.error ?? 'Error gastos de visita');
      if (!incomesRes.ok) throw new Error(incomesPayload.error ?? 'Error aportaciones');
      if (!trendsRes.ok) throw new Error(trendsPayload.error ?? 'Error ventas del periodo');
      if (!moneyRes.ok) throw new Error(moneyPayload.error ?? 'Error caja y cuenta');
      setMargins(marginsPayload.margins);
      setCosts(costsPayload.costs);
      setSummary(profitPayload.summary);
      setPurchasesTotal(Number(profitPayload.purchasesTotal ?? 0));
      setCategories(categoriesPayload.categories);
      setVisitExpenses(expensesPayload.expenses ?? []);
      setIncomes(incomesPayload.incomes ?? []);
      setMoneyPosition(moneyPayload.position ?? null);
      setAdjustingPockets(false);
      setFrom(profitPayload.from ?? nextFrom);
      setTo(profitPayload.to ?? nextTo);
      setActivePeriodLabel(profitPayload.periodLabel ?? activePeriodLabel);
      setPreset(detectPreset(profitPayload.from ?? nextFrom, profitPayload.to ?? nextTo));
      await applyTrends(trendsPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoadingPeriod(false);
    }
  }

  useEffect(() => {
    fetch(`/api/forecast/trends?${qs(from, to)}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'Error ventas del periodo');
        await applyTrends(payload);
      })
      .catch(() => {
        /* charts load in the background; period cards still useful */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          effectiveFrom: from,
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
    const applies = costAppliesToRange(row.terms, from, to);
    await fetch(`/api/costs/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applies: !applies, periodStart: from }),
    });
    await loadPeriod(from, to);
  }

  async function removeCost(id: string) {
    if (!confirm('¿Eliminar este costo?')) return;
    await fetch(`/api/costs/${id}`, { method: 'DELETE' });
    await loadPeriod(from, to);
  }

  async function addIncome() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/incomes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryType: incomeType,
          concept: incomeConcept,
          amount: parseDecimal(incomeAmountText),
          entryDate: incomeDate,
          notes: incomeNotes,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar');
      setIncomeConcept('');
      setIncomeAmountText('');
      setIncomeNotes('');
      setOpenGastos(true);
      setOpenMovimientos(true);
      await loadPeriod(from, to);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function removeIncome(id: string) {
    if (!confirm('¿Eliminar este movimiento?')) return;
    await fetch(`/api/incomes/${id}`, { method: 'DELETE' });
    await loadPeriod(from, to);
  }

  async function saveIncomeEdit() {
    if (!editIncome) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/incomes/${editIncome.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryType: editIncome.entryType,
          concept: editIncome.concept,
          amount: parseDecimal(editIncome.amount),
          entryDate: editIncome.entryDate,
          notes: editIncome.notes || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar');
      setEditIncome(null);
      await loadPeriod(from, to);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function saveVisitEdit() {
    if (!editVisit) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/expenses/${editVisit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept: editVisit.concept,
          amount: parseDecimal(editVisit.amount),
          expenseDate: editVisit.expenseDate,
          notes: editVisit.notes || null,
          paidFrom: editVisit.paidFrom,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar');
      setEditVisit(null);
      await loadPeriod(from, to);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function removeVisit(id: string) {
    if (!confirm('¿Eliminar este gasto de visita?')) return;
    await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    if (editVisit?.id === id) setEditVisit(null);
    await loadPeriod(from, to);
  }

  async function saveCostEdit() {
    if (!editCost) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/costs/${editCost.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editCost.name,
          amount: parseDecimal(editCost.amount),
          costType: editCost.costType,
          period: editCost.period,
          paidFrom: editCost.paidFrom,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar');
      setEditCost(null);
      await loadPeriod(from, to);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function saveMoneyAdjust() {
    if (!canAdjustMoney) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/money-position', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cashAmount: parseDecimal(cashAdjustText),
          accountAmount: parseDecimal(accountAdjustText),
          asOfDate: to,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar el conteo');
      setMoneyPosition(result.position ?? null);
      setAdjustingPockets(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  const net = summary ? Number(summary.estimated_net_profit) : 0;
  const netPositive = net >= 0;
  const exportQuery = qs(from, to);

  const inventorySpread = totals.inventorySale - totals.inventoryCost;
  const contributionsTotal = incomes
    .filter((row) => row.entry_type === 'contribution')
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const activeFixedTotal = costs
    .filter((row) => costAppliesToRange(row.terms, from, to))
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const otherIncomeTotal = Number(summary?.other_income ?? 0);
  const visitTotal = Number(summary?.visit_expenses ?? 0);
  const periodMovements = useMemo(() => {
    const visits = visitExpenses.map((row) => ({
      key: `visit-${row.id}`,
      kind: 'visit' as const,
      id: row.id,
      date: row.expense_date,
      concept: row.concept,
      notes: row.notes,
      amount: Number(row.amount),
      paidFrom: parseMoneyPocket(row.paid_from),
    }));
    const incomeRows = incomes.map((row) => ({
      key: `income-${row.id}`,
      kind: 'income' as const,
      id: row.id,
      date: row.entry_date,
      concept: row.concept,
      notes: row.notes,
      amount: Number(row.amount),
      entryType: row.entry_type,
    }));
    return [...visits, ...incomeRows].sort((a, b) => b.date.localeCompare(a.date));
  }, [visitExpenses, incomes]);
  const visitMovements = periodMovements.filter((row) => row.kind === 'visit');
  const incomeMovements = periodMovements.filter((row) => row.kind === 'income');

  return (
    <div className="space-y-6">
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
        <ActionChip emoji="🔄" disabled={loadingPeriod} onClick={() => void loadPeriod(from, to)}>
          {loadingPeriod ? 'Cargando…' : 'Actualizar'}
        </ActionChip>
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

      <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-3 sm:gap-3">
        <div className="grid grid-cols-1 gap-2 sm:gap-3">
          <MetricCard
            emoji="🧺"
            tone="green"
            label="Vendiste"
            value={formatMoney(Number(summary?.revenue ?? 0))}
            hint={`${summary?.order_count ?? 0} ticket${summary?.order_count === 1 ? '' : 's'} · ${activePeriodLabel}`}
          />
          <MetricCard
            emoji="📦"
            tone="slate"
            label="Inventario a costo"
            value={formatMoney(totals.inventoryCost)}
            hint="Lo que pagaste por lo que hay"
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:gap-3">
          <MetricCard
            emoji="🧾"
            tone="amber"
            label="Te costó"
            value={formatMoney(
              Number(summary?.cogs ?? 0) + Number(summary?.operating_costs_total ?? 0),
            )}
            hint="Mercancía + fijos + visita"
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
        <div className="grid grid-cols-1 gap-2 sm:gap-3">
          <TeQuedoCard
            net={net}
            netPositive={netPositive}
            position={moneyPosition}
            adjusting={adjustingPockets}
            cashText={cashAdjustText}
            accountText={accountAdjustText}
            saving={saving}
            canAdjust={canAdjustMoney}
            onCashText={setCashAdjustText}
            onAccountText={setAccountAdjustText}
            onToggleAdjust={() => {
              if (!canAdjustMoney) return;
              if (adjustingPockets) {
                setAdjustingPockets(false);
                return;
              }
              setCashAdjustText(formatDecimal(moneyPosition?.cash ?? 0));
              setAccountAdjustText(formatDecimal(moneyPosition?.account ?? 0));
              setAdjustingPockets(true);
            }}
            onSave={() => void saveMoneyAdjust()}
          />
          {contributionsTotal > 0 ? (
            <MetricCard
              emoji="💵"
              tone="green"
              label="Aportaste"
              value={formatMoney(contributionsTotal)}
              hint="Capital que metiste. Ya está en Te quedó."
            />
          ) : null}
        </div>
      </div>

      <details
        className="group pv-glass-card space-y-4 p-4 sm:p-6"
        open={openVentas}
        onToggle={(event) => setOpenVentas(event.currentTarget.open)}
      >
        <FoldableSummary
          title="Ventas del periodo"
          hint={`${activePeriodLabel} · ${formatMoney(Number(summary?.revenue ?? 0))}`}
          emoji="📈"
          iconClass="bg-sky-100"
          actions={
            <ActionChip emoji="🔄" disabled={loadingPeriod} onClick={() => void loadPeriod(from, to)}>
              {loadingPeriod ? 'Cargando…' : 'Actualizar'}
            </ActionChip>
          }
        />

        <PeriodSalesCharts
          periodLabel={activePeriodLabel}
          total={Number(summary?.revenue ?? 0)}
          series={series}
          topProducts={topProducts}
          topWeekdays={topWeekdays}
          paymentBreakdown={paymentBreakdown}
        />

        <ProfitBuildUp summary={summary} />
      </details>

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
                    {row.product_count} productos · {formatDecimal(Number(row.units_sold))} unidades
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {categories.length > 0 ? (
          <details className="group/sub rounded-xl border border-slate-100">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
              <p className="text-sm font-medium text-slate-800">Tabla detallada</p>
              <NestedFoldChip />
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
                      <td className="px-4 py-2">{formatDecimal(Number(row.units_sold))}</td>
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
          hint="Mercancía vendida, renta y visita. Las compras de inventario van aparte, para cuadrar. Las aportaciones sí entran a Te quedó."
          emoji="🧾"
          iconClass="bg-amber-100"
        />

        <CashSquare
          revenue={Number(summary?.revenue ?? 0)}
          contributions={contributionsTotal}
          otherIncome={Number(summary?.other_income ?? 0)}
          purchases={purchasesTotal}
          visit={Number(summary?.visit_expenses ?? 0)}
          inventoryCost={totals.inventoryCost}
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

        <details
          className="group/sub rounded-xl border border-slate-100"
          open={openMovimientos}
          onToggle={(event) => setOpenMovimientos(event.currentTarget.open)}
        >
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
            <div className="flex min-w-0 items-start gap-3">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xl"
                aria-hidden
              >
                📒
              </div>
              <div className="min-w-0">
                <p className="text-base font-semibold text-slate-900">Visita y aportaciones</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  {periodMovements.length} registro{periodMovements.length === 1 ? '' : 's'}
                  {visitTotal > 0 ? ` · visita ${formatMoney(visitTotal)}` : ''}
                  {contributionsTotal + otherIncomeTotal > 0
                    ? ` · aportes ${formatMoney(contributionsTotal + otherIncomeTotal)}`
                    : ''}
                </p>
              </div>
            </div>
            <NestedFoldChip />
          </summary>
          <div className="border-t border-slate-100">
            <p className="px-4 pt-3 text-sm text-slate-500">
              La visita se carga en Compras. Aquí anotas aportaciones u otros ingresos.
            </p>
            {visitMovements.length > 0 ? (
              <details className="group/vis border-t border-slate-100">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 marker:content-none [&::-webkit-details-marker]:hidden">
                  <p className="text-sm font-medium text-slate-800">
                    Gastos de visita
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {visitMovements.length} · {formatMoney(visitTotal)}
                    </span>
                  </p>
                  <NestedFoldChip group="vis" />
                </summary>
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {visitMovements.map((row) => {
                    const editing = editVisit?.id === row.id;
                    return (
                      <li key={row.key} className="px-4 py-2.5 text-sm">
                        {editing && editVisit ? (
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              className="pv-input col-span-2"
                              value={editVisit.concept}
                              onChange={(e) =>
                                setEditVisit((d) => (d ? { ...d, concept: e.target.value } : d))
                              }
                            />
                            <DecimalInput
                              className="pv-input"
                              groupThousands
                              value={editVisit.amount}
                              onChange={(value) =>
                                setEditVisit((d) => (d ? { ...d, amount: value } : d))
                              }
                            />
                            <input
                              type="date"
                              max={today}
                              className="pv-input"
                              value={editVisit.expenseDate}
                              onChange={(e) =>
                                setEditVisit((d) => (d ? { ...d, expenseDate: e.target.value } : d))
                              }
                            />
                            <input
                              className="pv-input col-span-2"
                              placeholder="Nota (opcional)"
                              value={editVisit.notes}
                              onChange={(e) =>
                                setEditVisit((d) => (d ? { ...d, notes: e.target.value } : d))
                              }
                            />
                            <div className="col-span-2">
                              <MoneyPocketField
                                value={editVisit.paidFrom}
                                onChange={(value) =>
                                  setEditVisit((d) => (d ? { ...d, paidFrom: value } : d))
                                }
                              />
                            </div>
                            <div className="col-span-2 flex flex-wrap gap-2">
                              <ActionChip emoji="💾" disabled={saving} onClick={() => void saveVisitEdit()}>
                                {saving ? 'Guardando…' : 'Guardar'}
                              </ActionChip>
                              <ActionChip elevated={false} onClick={() => setEditVisit(null)}>
                                Cancelar
                              </ActionChip>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900">{row.concept}</p>
                              <p className="text-xs text-slate-500">
                                {row.date}
                                {` · ${MONEY_POCKET_LABELS[row.paidFrom]}`}
                                {row.notes ? ` · ${row.notes}` : ''}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold tabular-nums text-slate-600">
                                −{formatMoney(row.amount)}
                              </p>
                              <ActionChip
                                elevated={false}
                                emoji="✏️"
                                onClick={() =>
                                  setEditVisit({
                                    id: row.id,
                                    concept: row.concept,
                                    amount: formatDecimal(row.amount),
                                    expenseDate: row.date,
                                    notes: row.notes ?? '',
                                    paidFrom: row.paidFrom,
                                  })
                                }
                              >
                                Editar
                              </ActionChip>
                              <ActionChip
                                elevated={false}
                                tone="rose"
                                emoji="🗑️"
                                onClick={() => void removeVisit(row.id)}
                              >
                                Eliminar
                              </ActionChip>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </details>
            ) : null}
            {incomeMovements.length === 0 && visitMovements.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-500">
                Sin gastos de visita ni aportaciones en este periodo.
              </p>
            ) : incomeMovements.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500">
                Sin aportaciones ni otros ingresos en este periodo.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {incomeMovements.map((row) => {
                  const editing = editIncome?.id === row.id;
                  return (
                    <li key={row.key} className="px-4 py-2.5 text-sm">
                      {editing && editIncome ? (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="col-span-2 flex flex-wrap gap-2">
                            {(['contribution', 'operating'] as IncomeEntryType[]).map((key) => (
                              <ActionChip
                                key={key}
                                elevated={editIncome.entryType === key}
                                tone={editIncome.entryType === key ? 'emerald' : 'slate'}
                                onClick={() =>
                                  setEditIncome((d) => (d ? { ...d, entryType: key } : d))
                                }
                              >
                                {INCOME_ENTRY_TYPE_LABELS[key]}
                              </ActionChip>
                            ))}
                          </div>
                          <input
                            className="pv-input col-span-2"
                            value={editIncome.concept}
                            onChange={(e) =>
                              setEditIncome((d) => (d ? { ...d, concept: e.target.value } : d))
                            }
                          />
                          <DecimalInput
                            className="pv-input"
                            groupThousands
                            value={editIncome.amount}
                            onChange={(value) =>
                              setEditIncome((d) => (d ? { ...d, amount: value } : d))
                            }
                          />
                          <input
                            type="date"
                            max={today}
                            className="pv-input"
                            value={editIncome.entryDate}
                            onChange={(e) =>
                              setEditIncome((d) => (d ? { ...d, entryDate: e.target.value } : d))
                            }
                          />
                          <input
                            className="pv-input col-span-2"
                            placeholder="Nota (opcional)"
                            value={editIncome.notes}
                            onChange={(e) =>
                              setEditIncome((d) => (d ? { ...d, notes: e.target.value } : d))
                            }
                          />
                          <div className="col-span-2 flex flex-wrap gap-2">
                            <ActionChip emoji="💾" disabled={saving} onClick={() => void saveIncomeEdit()}>
                              {saving ? 'Guardando…' : 'Guardar'}
                            </ActionChip>
                            <ActionChip elevated={false} onClick={() => setEditIncome(null)}>
                              Cancelar
                            </ActionChip>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900">{row.concept}</p>
                            <p className="text-xs text-slate-500">
                              {INCOME_ENTRY_TYPE_LABELS[row.entryType]} · {row.date}
                              {row.notes ? ` · ${row.notes}` : ''}
                              {' · entra a Te quedó'}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold tabular-nums text-slate-800">
                              {formatMoney(row.amount)}
                            </p>
                            <ActionChip
                              elevated={false}
                              emoji="✏️"
                              onClick={() =>
                                setEditIncome({
                                  id: row.id,
                                  entryType: row.entryType,
                                  concept: row.concept,
                                  amount: formatDecimal(row.amount),
                                  entryDate: row.date,
                                  notes: row.notes ?? '',
                                })
                              }
                            >
                              Editar
                            </ActionChip>
                            <ActionChip
                              elevated={false}
                              tone="rose"
                              emoji="🗑️"
                              onClick={() => void removeIncome(row.id)}
                            >
                              Eliminar
                            </ActionChip>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="border-t border-slate-100 bg-slate-50/80 p-4">
              <p className="text-xs text-slate-500">{INCOME_ENTRY_TYPE_HINTS[incomeType]}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(['contribution', 'operating'] as IncomeEntryType[]).map((key) => (
                  <ActionChip
                    key={key}
                    elevated={incomeType === key}
                    tone={incomeType === key ? 'emerald' : 'slate'}
                    onClick={() => setIncomeType(key)}
                  >
                    {INCOME_ENTRY_TYPE_LABELS[key]}
                  </ActionChip>
                ))}
              </div>
              <div className="mt-3 grid min-w-0 grid-cols-2 items-end gap-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)_8.5rem_auto]">
                <input
                  placeholder="Concepto"
                  className="pv-input min-w-0 col-span-2 lg:col-span-1"
                  value={incomeConcept}
                  onChange={(e) => setIncomeConcept(e.target.value)}
                />
                <DecimalInput
                  placeholder="Monto"
                  className="pv-input min-w-0"
                  groupThousands
                  value={incomeAmountText}
                  onChange={setIncomeAmountText}
                />
                <input
                  type="date"
                  max={today}
                  className="pv-input min-w-0"
                  value={incomeDate}
                  onChange={(e) => setIncomeDate(e.target.value)}
                />
                <div className="col-span-2 flex justify-end lg:col-span-1">
                  <ActionChip emoji="💰" disabled={saving} onClick={() => void addIncome()}>
                    Agregar
                  </ActionChip>
                </div>
              </div>
              <input
                placeholder="Nota (opcional)"
                className="pv-input mt-2 w-full text-sm"
                value={incomeNotes}
                onChange={(e) => setIncomeNotes(e.target.value)}
              />
            </div>
          </div>
        </details>

        <details className="group/sub rounded-xl border border-slate-100">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
            <div className="flex min-w-0 items-start gap-3">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl"
                aria-hidden
              >
                🏠
              </div>
              <div className="min-w-0">
                <p className="text-base font-semibold text-slate-900">Renta, nómina y otros</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  {costs.length} costo{costs.length === 1 ? '' : 's'}
                  {activeFixedTotal > 0 ? ` · ${formatMoney(activeFixedTotal)} activos` : ''}
                </p>
              </div>
            </div>
            <NestedFoldChip />
          </summary>
          <div className="border-t border-slate-100">
            <p className="px-4 pt-3 text-sm text-slate-500">
              Gastos fijos del local. Activar o pausar vale desde el periodo que estás viendo hacia
              adelante; no cambia los meses anteriores. En el mes en curso o el anterior se cuenta el
              monto completo; en un rango a modo se prorratea.
            </p>
            {costs.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-500">Sin gastos fijos todavía.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {costs.map((row) => {
                  const applies = costAppliesToRange(row.terms, from, to);
                  const editing = editCost?.id === row.id;
                  return (
                    <li
                      key={row.id}
                      className={`px-4 py-2.5 ${applies ? '' : 'opacity-70'}`}
                    >
                      {editing && editCost ? (
                        <div className="grid min-w-0 grid-cols-2 items-center gap-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.5fr)_7rem_8rem_7.5rem_auto]">
                          <input
                            className="pv-input min-w-0 col-span-2 lg:col-span-1"
                            value={editCost.name}
                            onChange={(e) =>
                              setEditCost((d) => (d ? { ...d, name: e.target.value } : d))
                            }
                          />
                          <DecimalInput
                            className="pv-input min-w-0"
                            groupThousands
                            value={editCost.amount}
                            onChange={(value) =>
                              setEditCost((d) => (d ? { ...d, amount: value } : d))
                            }
                          />
                          <select
                            className="pv-input min-w-0"
                            value={editCost.costType}
                            onChange={(e) =>
                              setEditCost((d) =>
                                d ? { ...d, costType: e.target.value as OperatingCostType } : d,
                              )
                            }
                          >
                            {OPERATING_COST_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {OPERATING_COST_TYPE_LABELS[t]}
                              </option>
                            ))}
                          </select>
                          <select
                            className="pv-input min-w-0"
                            value={editCost.period}
                            onChange={(e) =>
                              setEditCost((d) =>
                                d ? { ...d, period: e.target.value as OperatingCostPeriod } : d,
                              )
                            }
                          >
                            {OPERATING_COST_PERIODS.map((p) => (
                              <option key={p} value={p}>
                                {OPERATING_COST_PERIOD_LABELS[p]}
                              </option>
                            ))}
                          </select>
                          <MoneyPocketField
                            label="Sale de"
                            value={editCost.paidFrom}
                            onChange={(value) =>
                              setEditCost((d) => (d ? { ...d, paidFrom: value } : d))
                            }
                          />
                          <div className="col-span-2 flex flex-wrap justify-end gap-2 lg:col-span-1">
                            <ActionChip emoji="💾" disabled={saving} onClick={() => void saveCostEdit()}>
                              {saving ? 'Guardando…' : 'Guardar'}
                            </ActionChip>
                            <ActionChip elevated={false} onClick={() => setEditCost(null)}>
                              Cancelar
                            </ActionChip>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900">{row.name}</p>
                            <p className="text-sm text-slate-500">
                              {OPERATING_COST_TYPE_LABELS[row.cost_type]} ·{' '}
                              {OPERATING_COST_PERIOD_LABELS[row.period]} ·{' '}
                              {MONEY_POCKET_LABELS[parseMoneyPocket(row.paid_from, 'account')]}
                              {applies ? ' · aplica aquí' : ' · pausado aquí'}
                            </p>
                          </div>
                          <p className="text-base font-bold tabular-nums text-slate-900">
                            {formatMoney(Number(row.amount))}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <ActionChip
                              elevated={false}
                              emoji="✏️"
                              onClick={() =>
                                setEditCost({
                                  id: row.id,
                                  name: row.name,
                                  amount: formatDecimal(Number(row.amount)),
                                  costType: row.cost_type,
                                  period: row.period,
                                  paidFrom: parseMoneyPocket(row.paid_from, 'account'),
                                })
                              }
                            >
                              Editar
                            </ActionChip>
                            <ActionChip
                              elevated={false}
                              emoji={applies ? '⏸️' : '▶️'}
                              onClick={() => void toggleCost(row)}
                            >
                              {applies ? 'Pausar aquí' : 'Activar aquí'}
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
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="border-t border-slate-100 bg-slate-50/80 p-4">
              <div className="grid min-w-0 grid-cols-2 items-center gap-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.5fr)_7rem_8rem_7.5rem_auto]">
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
              <MoneyPocketField
                label="Sale de"
                value={costForm.paidFrom ?? 'account'}
                onChange={(value) => setCostForm((f) => ({ ...f, paidFrom: value }))}
              />
              <div className="col-span-2 flex justify-end lg:col-span-1">
                <ActionChip emoji="🧾" disabled={saving} onClick={addCost}>
                  Agregar costo
                </ActionChip>
              </div>
            </div>
          </div>
        </div>
        </details>
      </details>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
