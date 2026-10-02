'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  OPERATING_COST_CATEGORIES,
  OPERATING_COST_CATEGORY_HINTS,
  OPERATING_COST_CATEGORY_LABELS,
  formatChargeDayLabel,
  formatDecimal,
  formatMoney,
  INCOME_ENTRY_TYPE_HINTS,
  INCOME_ENTRY_TYPE_LABELS,
  defaultIncomePocket,
  parseIncomePocket,
  MONEY_POCKET_LABELS,
  costAppliesToRange,
  costPausedAtPeriodStart,
  costTypeFromCategory,
  groupOperatingCostsByCategory,
  inferOperatingCostCategory,
  normalizeChargeDay,
  operatingCostAmountForRange,
  parseMoneyPocket,
  parseOperatingCostCategory,
  pocketTotal,
  type IncomeEntryType,
  type MoneyPocket,
  type MoneyPositionView,
  type OperatingCostCategory,
  type OperatingCostInput,
  type OperatingCostPeriod,
  type OperatingCostTerm,
  type OperatingCostType,
  type ProductUnit,
} from '@puertaverde/shared';

import { ActionChip, ChevronDownIcon, FoldableSummary, NestedFoldChip } from '@/components/ActionChip';
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
  addMexicoDays,
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
  category?: OperatingCostCategory | null;
  period: OperatingCostPeriod;
  amount: number;
  notes: string | null;
  is_active: boolean;
  paid_from?: MoneyPocket | null;
  charge_day?: number | null;
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
  paid_from?: MoneyPocket | null;
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
  category: 'payroll',
  period: 'monthly',
  amount: 0,
  notes: '',
  isActive: true,
  paidFrom: 'account',
  chargeDay: 1,
};

const OPERATING_COST_CATEGORY_BAR: Record<
  OperatingCostCategory,
  { emoji: string; color: string }
> = {
  rent: { emoji: '🏠', color: 'bg-slate-400' },
  payroll: { emoji: '👥', color: 'bg-violet-400' },
  fixed: { emoji: '💡', color: 'bg-emerald-500' },
  variable: { emoji: '🛍️', color: 'bg-orange-400' },
};

function CostCategoryField({
  value,
  onChange,
}: {
  value: OperatingCostCategory;
  onChange: (value: OperatingCostCategory) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {OPERATING_COST_CATEGORIES.map((category) => (
        <ActionChip
          key={category}
          elevated={value === category}
          tone={value === category ? 'emerald' : 'slate'}
          onClick={() => onChange(category)}
        >
          {OPERATING_COST_CATEGORY_LABELS[category]}
        </ActionChip>
      ))}
    </div>
  );
}

function costCategoryOf(row: CostRow): OperatingCostCategory {
  return inferOperatingCostCategory({
    name: row.name,
    category: row.category,
    costType: row.cost_type,
  });
}

function chargedCostAmount(row: CostRow, from: string, to: string) {
  return operatingCostAmountForRange(
    {
      costType: row.cost_type,
      period: row.period,
      amount: Number(row.amount),
      chargeDay: normalizeChargeDay(row.charge_day),
      terms: row.terms,
    },
    from,
    to,
  );
}

function monthParts(ymd: string): { year: number; month: number } {
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(5, 7));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    const today = todayMexicoYmd();
    return { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
  }
  return { year, month };
}

function daysInViewedMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function ChargeDayField({
  value,
  onChange,
  monthYmd,
}: {
  value: number;
  onChange: (day: number) => void;
  monthYmd: string;
}) {
  const { year, month } = monthParts(monthYmd);
  const dayCount = daysInViewedMonth(year, month);
  const selected = Math.min(normalizeChargeDay(value), dayCount);
  const monthKey = pad2(month);
  const ymd = `${year}-${monthKey}-${pad2(selected)}`;

  return (
    <input
      type="date"
      className="pv-input min-w-0"
      aria-label="Se suma el día"
      min={`${year}-${monthKey}-01`}
      max={`${year}-${monthKey}-${pad2(dayCount)}`}
      value={ymd}
      onChange={(event) => {
        const day = Number(event.target.value.slice(8, 10));
        if (Number.isInteger(day) && day >= 1 && day <= 31) onChange(day);
      }}
    />
  );
}

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
    <div className="pv-glass-card flex h-full gap-3 p-4">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl ${BADGE_TONES[tone]}`}
        aria-hidden
      >
        {emoji}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-xl font-bold text-slate-900">{value}</p>
        {hint ? <p className="mt-auto pt-0.5 text-xs text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
}

function TeQuedoCard({
  total,
  totalPositive,
  position,
}: {
  total: number;
  totalPositive: boolean;
  position: MoneyPositionView | null;
}) {
  return (
    <div className="pv-glass-card flex h-full gap-3 p-4">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl ${
          totalPositive ? BADGE_TONES.profit : BADGE_TONES.loss
        }`}
        aria-hidden
      >
        {totalPositive ? '💚' : '⚠️'}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tienes</p>
        <p className="mt-0.5 truncate text-xl font-bold text-slate-900">{formatMoney(total)}</p>
        <p className="mt-auto truncate pt-0.5 text-xs text-slate-500">
          En caja {formatMoney(position?.cash ?? 0)} · En cuenta {formatMoney(position?.account ?? 0)}
        </p>
      </div>
    </div>
  );
}

function ProfitBuildUp({
  summary,
  wasteCost,
  zeroCostSold,
  operatingByCategory = [],
}: {
  summary: ProfitSummary | null;
  wasteCost: number;
  zeroCostSold: Array<{ name: string; revenue: number }>;
  operatingByCategory?: Array<{ category: OperatingCostCategory; amount: number }>;
}) {
  if (!summary) return null;

  const revenue = Number(summary.revenue);
  const cogs = Number(summary.cogs);
  const fixed = Number(summary.fixed_costs);
  const visit = Number(summary.visit_expenses);
  const other = Math.max(Number(summary.variable_costs) - visit, 0);
  const otherIncome = Number(summary.other_income ?? 0);
  const contributions = Number(summary.contributions ?? 0);
  const waste = Math.max(wasteCost, 0);
  const net = Number(summary.estimated_net_profit) - waste;
  const netPositive = net >= 0;
  const operatingNet = net - contributions;
  const operatingNetPositive = operatingNet >= 0;
  const gross = Number(summary.gross_profit ?? revenue - cogs);
  const grossPct =
    revenue > 0 ? Number(summary.gross_margin_percent ?? (gross / revenue) * 100) : null;
  const netPct = revenue > 0 ? (operatingNet / revenue) * 100 : null;
  const categoryLines = operatingByCategory.filter((row) => row.amount > 0.009);

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
    label: '− Costo de lo vendido',
    hint: 'La mercancía que sí se vendió, no el anaquel',
    delta: -cogs,
    running,
  });
  if (categoryLines.length) {
    for (const row of categoryLines) {
      running -= row.amount;
      steps.push({
        key: row.category,
        label: `− ${OPERATING_COST_CATEGORY_LABELS[row.category]}`,
        hint: OPERATING_COST_CATEGORY_HINTS[row.category],
        delta: -row.amount,
        running,
      });
    }
  } else {
    running -= fixed;
    steps.push({
      key: 'fixed',
      label: '− Renta y nómina',
      hint: 'Renta, nómina y otros del local',
      delta: -fixed,
      running,
    });
    const variableTotal = other + visit;
    if (variableTotal > 0) {
      running -= variableTotal;
      steps.push({
        key: 'variable',
        label: '− Gastos variables',
        hint: OPERATING_COST_CATEGORY_HINTS.variable,
        delta: -variableTotal,
        running,
      });
    }
  }
  if (waste > 0) {
    running -= waste;
    steps.push({
      key: 'waste',
      label: '− Merma',
      hint: 'Mercancía que se tiró, no se vendió',
      delta: -waste,
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
      <p className="mt-0.5 text-sm text-slate-500">
        Ganancia del periodo, no lo que hay en caja. Eso está en Tienes.
      </p>
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
      {zeroCostSold.length > 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          Vendiste sin costo cargado:{' '}
          {zeroCostSold
            .slice(0, 4)
            .map((row) => `${row.name} ${formatMoney(row.revenue)}`)
            .join(' · ')}
          {zeroCostSold.length > 4 ? ` · +${zeroCostSold.length - 4}` : ''}. Eso infla el margen.
        </p>
      ) : null}
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
  initialWasteCost,
  initialZeroCostSold,
  initialMoneyPosition,
  initialSummary,
  initialCategories,
}: {
  periodLabel: string;
  initialFrom: string;
  initialTo: string;
  initialMargins: MarginRow[];
  initialCosts: CostRow[];
  initialVisitExpenses: VisitExpenseRow[];
  initialIncomes: IncomeRow[];
  initialPurchasesTotal: number;
  initialWasteCost: number;
  initialZeroCostSold: Array<{ name: string; revenue: number }>;
  initialMoneyPosition: MoneyPositionView | null;
  initialSummary: ProfitSummary | null;
  initialCategories: CategoryProfitRow[];
}) {
  const [margins, setMargins] = useState(initialMargins);
  const [costs, setCosts] = useState(initialCosts);
  const [visitExpenses, setVisitExpenses] = useState(initialVisitExpenses);
  const [incomes, setIncomes] = useState(initialIncomes);
  const [purchasesTotal, setPurchasesTotal] = useState(initialPurchasesTotal);
  const [wasteCost, setWasteCost] = useState(initialWasteCost);
  const [zeroCostSold, setZeroCostSold] = useState(initialZeroCostSold);
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
  const [incomePaidFrom, setIncomePaidFrom] = useState<MoneyPocket>('account');
  const [saving, setSaving] = useState(false);
  const [loadingPeriod, setLoadingPeriod] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllMargins, setShowAllMargins] = useState(false);
  const [openVentas, setOpenVentas] = useState(false);
  const [openGastosUtilidad, setOpenGastosUtilidad] = useState(false);
  const [openCategoria, setOpenCategoria] = useState(false);
  const [openMargenes, setOpenMargenes] = useState(false);
  const [openGastosLista, setOpenGastosLista] = useState(false);
  const [openIngresos, setOpenIngresos] = useState(false);
  const [series, setSeries] = useState<TrendPoint[]>([]);
  const [chartsStatus, setChartsStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [topWeekdays, setTopWeekdays] = useState<WeekdayRow[]>([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState<PaymentRow[]>([]);
  const [moneyPosition, setMoneyPosition] = useState<MoneyPositionView | null>(initialMoneyPosition);
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
    paidFrom: MoneyPocket;
  } | null>(null);
  const [editCost, setEditCost] = useState<{
    id: string;
    name: string;
    amount: string;
    costType: OperatingCostType;
    category: OperatingCostCategory;
    period: OperatingCostPeriod;
    paidFrom: MoneyPocket;
    chargeDay: number;
  } | null>(null);

  const today = todayMexicoYmd();

  const totals = useMemo(() => {
    const inventoryCost = margins.reduce((s, r) => s + Number(r.inventory_value_cost), 0);
    const inventorySale = margins.reduce((s, r) => s + Number(r.inventory_value_sale), 0);
    return { inventoryCost, inventorySale };
  }, [margins]);

  const categoryMaxProfit = useMemo(
    () => Math.max(...categories.map((c) => Math.abs(Number(c.gross_profit))), 1),
    [categories],
  );

  const sortedMargins = useMemo(
    () => [...margins].sort((a, b) => Number(b.margin_percent) - Number(a.margin_percent)),
    [margins],
  );
  const inStockMargins = useMemo(
    () => sortedMargins.filter((row) => Number(row.stock) > 0),
    [sortedMargins],
  );

  const visibleMargins = showAllMargins ? inStockMargins : inStockMargins.slice(0, 12);
  const marginBarMax = useMemo(
    () => Math.max(...inStockMargins.map((m) => Math.abs(Number(m.margin_percent))), 1),
    [inStockMargins],
  );

  const costBreakdown = useMemo(() => {
    const purchases = purchasesTotal;
    const visit = Number(summary?.visit_expenses ?? 0);
    const listed = costs.filter((row) => costAppliesToRange(row.terms, from, to));
    const categorySegs = groupOperatingCostsByCategory(listed, costCategoryOf)
      .map((group) => {
        const amount = group.items.reduce((sum, row) => sum + chargedCostAmount(row, from, to), 0);
        const style = OPERATING_COST_CATEGORY_BAR[group.category];
        return {
          key: group.category,
          label: group.label,
          emoji: style.emoji,
          amount,
          color: style.color,
        };
      })
      .filter((seg) => seg.amount > 0);
    if (visit > 0) {
      const variableIdx = categorySegs.findIndex((seg) => seg.key === 'variable');
      if (variableIdx >= 0) {
        const current = categorySegs[variableIdx]!;
        categorySegs[variableIdx] = { ...current, amount: current.amount + visit };
      } else {
        const style = OPERATING_COST_CATEGORY_BAR.variable;
        categorySegs.push({
          key: 'variable',
          label: OPERATING_COST_CATEGORY_LABELS.variable,
          emoji: style.emoji,
          amount: visit,
          color: style.color,
        });
      }
    }
    const segments = [
      { key: 'purchases', label: 'Compras', emoji: '🛒', amount: purchases, color: 'bg-amber-400' },
      ...categorySegs,
    ].filter((seg) => seg.amount > 0);
    const total = segments.reduce((sum, seg) => sum + seg.amount, 0);
    return {
      total,
      segments: segments.map((seg) => ({
        ...seg,
        percent: total > 0 ? (seg.amount / total) * 100 : 0,
      })),
    };
  }, [summary, purchasesTotal, costs, from, to]);

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
    setChartsStatus('loading');
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
      if (!moneyRes.ok) throw new Error(moneyPayload.error ?? 'Error caja y cuenta');
      setMargins(marginsPayload.margins);
      setCosts(costsPayload.costs);
      setSummary(profitPayload.summary);
      setPurchasesTotal(Number(profitPayload.purchasesTotal ?? 0));
      setWasteCost(Number(profitPayload.wasteCost ?? 0));
      setZeroCostSold(profitPayload.zeroCostSold ?? []);
      setCategories(categoriesPayload.categories);
      setVisitExpenses(expensesPayload.expenses ?? []);
      setIncomes(incomesPayload.incomes ?? []);
      setMoneyPosition(moneyPayload.position ?? null);
      setFrom(profitPayload.from ?? nextFrom);
      setTo(profitPayload.to ?? nextTo);
      setActivePeriodLabel(profitPayload.periodLabel ?? activePeriodLabel);
      setPreset(detectPreset(profitPayload.from ?? nextFrom, profitPayload.to ?? nextTo));
      if (trendsRes.ok) {
        setChartsStatus('ready');
        await applyTrends(trendsPayload);
      } else {
        setChartsStatus('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      setChartsStatus('error');
    } finally {
      setLoadingPeriod(false);
    }
  }

  useEffect(() => {
    setChartsStatus('loading');
    fetch(`/api/forecast/trends?${qs(from, to)}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'Error ventas del periodo');
        await applyTrends(payload);
        setChartsStatus('ready');
      })
      .catch(() => {
        setChartsStatus('error');
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
          costType: costTypeFromCategory(parseOperatingCostCategory(costForm.category, 'payroll')),
          category: parseOperatingCostCategory(costForm.category, 'payroll'),
          effectiveFrom: from,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar');
      setCostForm(emptyCost);
      setCostAmountText('');
      setOpenGastosUtilidad(true);
      setOpenGastosLista(true);
      await loadPeriod(from, to);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleCost(row: CostRow) {
    const applies = costAppliesToRange(row.terms, from, to);
    if (applies) {
      const ok = window.confirm(
        'Se deja de mostrar de este mes en adelante. En los meses anteriores se queda. ¿Quitar de la lista?',
      );
      if (!ok) return;
    }
    await fetch(`/api/costs/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applies: !applies, periodStart: from }),
    });
    await loadPeriod(from, to);
  }

  async function removeCost(id: string) {
    const ok = window.confirm(
      'Esto lo borra de todos los meses, también de los anteriores. Si solo ya no lo vas a usar, mejor quítalo de la lista. ¿Borrar del todo?',
    );
    if (!ok) return;
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
          paidFrom: incomePaidFrom,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar');
      setIncomeConcept('');
      setIncomeAmountText('');
      setIncomeNotes('');
      setOpenGastosUtilidad(true);
      setOpenIngresos(true);
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
          paidFrom: editIncome.paidFrom,
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
          category: editCost.category,
          period: editCost.period,
          paidFrom: editCost.paidFrom,
          chargeDay: editCost.chargeDay,
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

  const leftover = pocketTotal({
    cash: moneyPosition?.cash ?? 0,
    account: moneyPosition?.account ?? 0,
  });
  const leftoverPositive = leftover >= 0;
  const exportQuery = qs(from, to);

  const revenue = Number(summary?.revenue ?? 0);
  const cogs = Number(summary?.cogs ?? 0);
  const cashOut =
    purchasesTotal + Number(summary?.operating_costs_total ?? 0);
  const contributionsTotal = incomes
    .filter((row) => row.entry_type === 'contribution')
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const listedCosts = costs.filter((row) => costAppliesToRange(row.terms, from, to));
  const listedCostGroups = groupOperatingCostsByCategory(listedCosts, costCategoryOf);
  const operatingByCategory = (() => {
    const rows = listedCostGroups.map((group) => ({
      category: group.category,
      amount: group.items.reduce((sum, row) => sum + chargedCostAmount(row, from, to), 0),
    }));
    const visit = Number(summary?.visit_expenses ?? 0);
    if (!(visit > 0.009)) return rows.filter((row) => row.amount > 0.009);
    const variableIdx = rows.findIndex((row) => row.category === 'variable');
    if (variableIdx >= 0) {
      return rows.map((row, index) =>
        index === variableIdx ? { ...row, amount: row.amount + visit } : row,
      );
    }
    return [...rows, { category: 'variable' as const, amount: visit }];
  })();
  const removedHereCosts = costs.filter(
    (row) =>
      !costAppliesToRange(row.terms, from, to) &&
      costPausedAtPeriodStart(row.terms, from, addMexicoDays(from, -1)),
  );
  const chargedThisPeriod =
    listedCosts.reduce(
      (sum, row) =>
        sum +
        operatingCostAmountForRange(
          {
            costType: row.cost_type,
            period: row.period,
            amount: Number(row.amount),
            chargeDay: normalizeChargeDay(row.charge_day),
            terms: row.terms,
          },
          from,
          to,
        ),
      0,
    ) + Number(summary?.visit_expenses ?? 0);
  const gastosSubtitle = OPERATING_COST_CATEGORIES.flatMap((category) => {
    const group = listedCostGroups.find((row) => row.category === category);
    let amount = group
      ? group.items.reduce((sum, row) => sum + Number(row.amount), 0)
      : 0;
    if (category === 'variable') amount += Number(summary?.visit_expenses ?? 0);
    if (!(amount > 0.009)) return [];
    return [`${OPERATING_COST_CATEGORY_LABELS[category]} ${formatMoney(amount)}`];
  });
  const otherIncomeTotal = Number(summary?.other_income ?? 0);
  const visitTotal = Number(summary?.visit_expenses ?? 0);
  const visitMovements = useMemo(
    () =>
      [...visitExpenses]
        .map((row) => ({
          id: row.id,
          date: row.expense_date,
          concept: row.concept,
          notes: row.notes,
          amount: Number(row.amount),
          paidFrom: parseMoneyPocket(row.paid_from),
        }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [visitExpenses],
  );
  const incomeMovements = useMemo(
    () =>
      [...incomes]
        .map((row) => ({
          id: row.id,
          date: row.entry_date,
          concept: row.concept,
          notes: row.notes,
          amount: Number(row.amount),
          entryType: row.entry_type,
          paidFrom: parseIncomePocket(row.paid_from, row.entry_type),
        }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [incomes],
  );

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

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
          <MetricCard
            emoji="🧺"
            tone="green"
            label="Vendiste"
            value={formatMoney(revenue)}
          />
          <MetricCard
            emoji="🥬"
            tone="amber"
            label="Costo de lo vendido"
            value={formatMoney(cogs)}
          />
          <MetricCard
            emoji="🧾"
            tone="slate"
            label="Salió de caja"
            value={formatMoney(cashOut)}
          />
          <MetricCard
            emoji="🏷️"
            tone="leaf"
            label="Inventario a venta"
            value={formatMoney(totals.inventorySale)}
          />
          <MetricCard
            emoji="📦"
            tone="slate"
            label="Inventario a costo"
            value={formatMoney(totals.inventoryCost)}
          />
          <TeQuedoCard
            total={leftover}
            totalPositive={leftoverPositive}
            position={moneyPosition}
          />
          {contributionsTotal > 0 ? (
            <MetricCard
              emoji="💵"
              tone="green"
              label="Aportaste"
              value={formatMoney(contributionsTotal)}
            />
          ) : null}
      </div>

      <details
        className="group pv-glass-card min-w-0 space-y-4 overflow-hidden p-4 sm:p-6"
        open={openVentas}
        onToggle={(event) => setOpenVentas(event.currentTarget.open)}
      >
        <FoldableSummary
          title="Ventas del periodo"
          hint={`${activePeriodLabel} · ${formatMoney(Number(summary?.revenue ?? 0))} · márgenes`}
          emoji="📈"
          iconClass="bg-sky-100"
        />

        <PeriodSalesCharts
          periodLabel={activePeriodLabel}
          total={Number(summary?.revenue ?? 0)}
          series={series}
          topProducts={topProducts}
          topWeekdays={topWeekdays}
          paymentBreakdown={paymentBreakdown}
          status={chartsStatus}
        />

        <details
          className="group/sub rounded-xl border border-slate-100"
          open={openCategoria}
          onToggle={(event) => setOpenCategoria(event.currentTarget.open)}
        >
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
            <div className="flex min-w-0 items-start gap-3">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xl"
                aria-hidden
              >
                📊
              </div>
              <div className="min-w-0">
                <p className="text-base font-semibold text-slate-900">Margen por categoría y producto</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  Mix vendido y anaquel de hoy · {activePeriodLabel}
                </p>
              </div>
            </div>
            <NestedFoldChip />
          </summary>
          <div className="space-y-4 border-t border-slate-100 p-4">

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

        <details
          className="group/vis rounded-xl border border-slate-100"
          open={openMargenes}
          onToggle={(event) => setOpenMargenes(event.currentTarget.open)}
        >
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">Margen de cada producto</p>
              <p className="mt-0.5 text-xs text-slate-500">Anaquel de hoy · no es el mix vendido</p>
            </div>
            <NestedFoldChip group="vis" />
          </summary>
          <div className="space-y-4 border-t border-slate-100 p-4">
        {inStockMargins.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">Sin productos con margen.</p>
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
            {inStockMargins.length > 12 ? (
              <ActionChip
                className="mt-4"
                emoji="📋"
                onClick={() => setShowAllMargins((v) => !v)}
              >
                {showAllMargins ? 'Ver menos' : `Ver todos (${inStockMargins.length})`}
              </ActionChip>
            ) : null}
          </div>
        )}
          </div>
        </details>
          </div>
        </details>
      </details>

      <details
        className="group pv-glass-card min-w-0 space-y-4 overflow-hidden p-4 sm:p-6"
        open={openGastosUtilidad}
        onToggle={(event) => setOpenGastosUtilidad(event.currentTarget.open)}
      >
        <FoldableSummary
          title="Gastos y Utilidad"
          hint="Desglose del periodo · abajo, cómo se gasta"
          emoji="🧮"
          iconClass="bg-violet-100"
        />
        <ProfitBuildUp
          summary={summary}
          wasteCost={wasteCost}
          zeroCostSold={zeroCostSold}
          operatingByCategory={operatingByCategory}
        />
        {summary && costBreakdown.total > 0 ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Gastos del mes</h3>
              <p className="mt-0.5 text-sm text-slate-500">
                Compras y gastos. La visita al mercado entra en variables.
              </p>
            </div>
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

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {costBreakdown.segments.map((seg) => (
                <div key={seg.key} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3">
                  <p className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${seg.color}`} aria-hidden />
                      <span aria-hidden>{seg.emoji}</span>
                      <span className="truncate">{seg.label}</span>
                    </span>
                    <span className="shrink-0 text-sm font-bold normal-case tracking-normal text-slate-900">
                      {formatMoney(seg.amount)}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <details
          className="group/sub rounded-xl border border-slate-100"
          open={openGastosLista}
          onToggle={(event) => setOpenGastosLista(event.currentTarget.open)}
        >
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
            <div className="flex min-w-0 items-start gap-3">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl"
                aria-hidden
              >
                🏠
              </div>
              <div className="min-w-0">
                <p className="text-base font-semibold text-slate-900">Gastos</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  {listedCosts.length + visitMovements.length} en la lista
                  {chargedThisPeriod > 0 ? ` · ${formatMoney(chargedThisPeriod)} este periodo` : ''}
                </p>
                {gastosSubtitle.length ? (
                  <p className="mt-0.5 text-xs text-slate-400">{gastosSubtitle.join(' · ')}</p>
                ) : null}
              </div>
            </div>
            <NestedFoldChip />
          </summary>
          <div className="border-t border-slate-100">
            <p className="px-4 pt-3 text-sm text-slate-500">
              Cada gasto del local se suma el día que eliges, completo. La visita (gasolina,
              diablero, caseta) entra en Gastos variables. Quitar de la lista lo oculta de este mes
              en adelante; en los meses anteriores se queda.
            </p>
            {listedCosts.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-500">
                Sin renta, nómina ni gastos fijos en este periodo.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {listedCostGroups.map((group) => {
                  const groupTotal = group.items.reduce((sum, row) => sum + Number(row.amount), 0);
                  return (
                    <li key={group.category}>
                      <details className="group/cost">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-slate-50/90 px-4 py-2.5 marker:content-none [&::-webkit-details-marker]:hidden">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800">{group.label}</p>
                            <p className="text-xs text-slate-500">
                              {group.items.length} · {group.hint}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <p className="text-sm font-semibold tabular-nums text-slate-900">
                              {formatMoney(groupTotal)}
                            </p>
                            <ChevronDownIcon nested="cost" className="text-slate-400" />
                          </div>
                        </summary>
                      <ul className="divide-y divide-slate-50 border-t border-slate-50">
                        {group.items.map((row) => {
                  const editing = editCost?.id === row.id;
                  const chargeDay = normalizeChargeDay(row.charge_day);
                  const charged = chargedCostAmount(row, from, to);
                  return (
                    <li key={row.id} className="px-4 py-2.5">
                      {editing && editCost ? (
                        <div className="space-y-2">
                          <CostCategoryField
                            value={editCost.category}
                            onChange={(category) =>
                              setEditCost((d) =>
                                d
                                  ? {
                                      ...d,
                                      category,
                                      costType: costTypeFromCategory(category),
                                    }
                                  : d,
                              )
                            }
                          />
                          <div className="grid min-w-0 grid-cols-2 items-end gap-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)_8.5rem_minmax(7.5rem,1fr)]">
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
                          <ChargeDayField
                            value={editCost.chargeDay}
                            onChange={(day) =>
                              setEditCost((d) => (d ? { ...d, chargeDay: day } : d))
                            }
                            monthYmd={from}
                          />
                          <MoneyPocketField
                            label="Sale de"
                            value={editCost.paidFrom}
                            onChange={(value) =>
                              setEditCost((d) => (d ? { ...d, paidFrom: value } : d))
                            }
                          />
                          <div className="col-span-2 flex flex-wrap gap-2">
                            <ActionChip emoji="💾" disabled={saving} onClick={() => void saveCostEdit()}>
                              {saving ? 'Guardando…' : 'Guardar'}
                            </ActionChip>
                            <ActionChip elevated={false} onClick={() => setEditCost(null)}>
                              Cancelar
                            </ActionChip>
                          </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900">{row.name}</p>
                            <p className="text-sm text-slate-500">
                              {formatChargeDayLabel(chargeDay)} ·{' '}
                              {MONEY_POCKET_LABELS[parseMoneyPocket(row.paid_from, 'account')]}
                              {charged > 0 ? ' · ya contó aquí' : ' · todavía no se suma'}
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
                                  category: costCategoryOf(row),
                                  period: row.period,
                                  paidFrom: parseMoneyPocket(row.paid_from, 'account'),
                                  chargeDay,
                                })
                              }
                            >
                              Editar
                            </ActionChip>
                            <ActionChip
                              elevated={false}
                              emoji="📤"
                              onClick={() => void toggleCost(row)}
                            >
                              Quitar de la lista
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
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}

            <details className="group/cost border-t border-slate-100">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-slate-50/90 px-4 py-2.5 marker:content-none [&::-webkit-details-marker]:hidden">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">Gastos de visita</p>
                  <p className="text-xs text-slate-500">
                    {visitMovements.length} · {OPERATING_COST_CATEGORY_HINTS.variable}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <p className="text-sm font-semibold tabular-nums text-slate-900">
                    {formatMoney(visitTotal)}
                  </p>
                  <ChevronDownIcon nested="cost" className="text-slate-400" />
                </div>
              </summary>
              {visitMovements.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-500">
                  Sin gastos de visita en este periodo. Se anotan al registrar la compra.
                </p>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {visitMovements.map((row) => {
                    const editing = editVisit?.id === row.id;
                    return (
                      <li key={row.id} className="px-4 py-2.5 text-sm">
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
              )}
            </details>

            {removedHereCosts.length > 0 ? (
              <details className="border-t border-slate-100">
                <summary className="cursor-pointer px-4 py-3 text-sm text-slate-500">
                  {removedHereCosts.length === 1
                    ? '1 gasto quitado de este mes'
                    : `${removedHereCosts.length} gastos quitados de este mes`}
                </summary>
                <ul className="divide-y divide-slate-100 border-t border-slate-50">
                  {removedHereCosts.map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-700">{row.name}</p>
                        <p className="text-sm text-slate-500">
                          No se suma de aquí en adelante. En meses anteriores se queda.
                        </p>
                      </div>
                      <p className="text-base font-bold tabular-nums text-slate-700">
                        {formatMoney(Number(row.amount))}
                      </p>
                      <ActionChip
                        elevated={false}
                        emoji="📥"
                        onClick={() => void toggleCost(row)}
                      >
                        Volver a la lista
                      </ActionChip>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            <div className="border-t border-slate-100 bg-slate-50/80 p-4">
              <CostCategoryField
                value={parseOperatingCostCategory(costForm.category, 'payroll')}
                onChange={(category) =>
                  setCostForm((f) => ({
                    ...f,
                    category,
                    costType: costTypeFromCategory(category),
                  }))
                }
              />
              <div className="mt-3 grid min-w-0 grid-cols-2 items-end gap-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)_8.5rem_minmax(7.5rem,1fr)_auto]">
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
                <ChargeDayField
                  value={costForm.chargeDay ?? 1}
                  onChange={(day) => setCostForm((f) => ({ ...f, chargeDay: day }))}
                  monthYmd={from}
                />
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

        <details
          className="group/sub rounded-xl border border-slate-100"
          open={openIngresos}
          onToggle={(event) => setOpenIngresos(event.currentTarget.open)}
        >
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
            <div className="flex min-w-0 items-start gap-3">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xl"
                aria-hidden
              >
                💰
              </div>
              <div className="min-w-0">
                <p className="text-base font-semibold text-slate-900">Otros ingresos</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  {incomeMovements.length} registro{incomeMovements.length === 1 ? '' : 's'}
                  {contributionsTotal + otherIncomeTotal > 0
                    ? ` · ${formatMoney(contributionsTotal + otherIncomeTotal)}`
                    : ''}
                </p>
              </div>
            </div>
            <NestedFoldChip />
          </summary>
          <div className="border-t border-slate-100">
            <p className="px-4 pt-3 text-sm text-slate-500">
              Aportaciones y reembolsos. Elige si entran a efectivo o a cuenta.
            </p>
            {incomeMovements.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-500">
                Sin aportaciones ni otros ingresos en este periodo.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {incomeMovements.map((row) => {
                  const editing = editIncome?.id === row.id;
                  return (
                    <li key={row.id} className="px-4 py-2.5 text-sm">
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
                          <div className="col-span-2">
                            <MoneyPocketField
                              label="Entra a"
                              value={editIncome.paidFrom}
                              onChange={(value) =>
                                setEditIncome((d) => (d ? { ...d, paidFrom: value } : d))
                              }
                            />
                          </div>
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
                              {` · ${MONEY_POCKET_LABELS[row.paidFrom]}`}
                              {row.notes ? ` · ${row.notes}` : ''}
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
                    onClick={() => {
                      setIncomeType(key);
                      setIncomePaidFrom(defaultIncomePocket(key));
                    }}
                  >
                    {INCOME_ENTRY_TYPE_LABELS[key]}
                  </ActionChip>
                ))}
              </div>
              <div className="mt-3 grid min-w-0 grid-cols-2 items-end gap-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)_8.5rem_minmax(7.5rem,1fr)_auto]">
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
                <MoneyPocketField
                  label="Entra a"
                  value={incomePaidFrom}
                  onChange={setIncomePaidFrom}
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

      </details>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
