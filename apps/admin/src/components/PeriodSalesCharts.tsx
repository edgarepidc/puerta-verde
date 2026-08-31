'use client';

import { useMemo, useState } from 'react';

import { PAYMENT_METHOD_LABELS, formatMoney, type PaymentMethod } from '@puertaverde/shared';

import { ActionChip } from '@/components/ActionChip';

export interface TrendPoint {
  date: string;
  amount: number;
}

export interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
  profit: number;
}

export interface WeekdayRow {
  weekday: number;
  label: string;
  amount: number;
  average: number;
  days: number;
}

export interface PaymentRow {
  method: PaymentMethod;
  amount: number;
  percent: number;
}

const PAYMENT_COLOR: Record<PaymentMethod, string> = {
  cash: '#16a34a',
  card_terminal: '#0284c7',
  transfer: '#d97706',
  online: '#7c3aed',
};

const WEEKDAY_MEDALS = ['🥇', '🥈', '🥉'];
const PRODUCT_RANK_LIMIT = 8;

type ProductRankMode = 'quantity' | 'revenue' | 'profit';

const PRODUCT_RANK_MODES: Array<{
  id: ProductRankMode;
  label: string;
  hint: string;
}> = [
  { id: 'quantity', label: 'Unidades', hint: 'Prioriza comprar lo que rota' },
  { id: 'revenue', label: 'Venta', hint: 'Lo que más cobras en caja' },
  { id: 'profit', label: 'Ingreso', hint: 'Lo que más deja después del costo' },
];

function productRankValue(product: TopProduct, mode: ProductRankMode) {
  if (mode === 'revenue') return product.revenue;
  if (mode === 'profit') return product.profit;
  return product.quantity;
}

function formatProductRankValue(product: TopProduct, mode: ProductRankMode) {
  if (mode === 'quantity') return Number(product.quantity.toFixed(2));
  return formatMoney(productRankValue(product, mode));
}

function formatChartDay(ymd: string) {
  return new Date(`${ymd}T12:00:00-06:00`).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
  });
}

function produceBarColor(name: string) {
  const n = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const rules: Array<[RegExp, string]> = [
    [/jitomate|tomate|fresa|sandia|manzana roja|chile|pimiento|betabel|remolacha|cereza|pina colada/, '#dc2626'],
    [/naranja|mandarina|mango|durazno|melon|zanahoria|maracuya|chabacano|calabaza/, '#ea580c'],
    [/limon|platano|banana|pina|maiz|elote|jengibre|guayaba/, '#ca8a04'],
    [
      /aguacate|pepino|calabacin|chayote|ejote|espinaca|lechuga|brocoli|cilantro|perejil|hierbabuena|nopal|apio|esparrago|kiwi|lima|ejotes/,
      '#16a34a',
    ],
    [/uva|berenjena|col morada|morado|fig/, '#7c3aed'],
    [/blueberry|mora|arandano/, '#2563eb'],
    [/cebolla|ajo|papa|camote|jicama|champinon|hongo|huevo|coco/, '#a16207'],
    [/coliflor|repollo|nabo/, '#94a3b8'],
  ];
  for (const [pattern, color] of rules) {
    if (pattern.test(n)) return color;
  }
  let hash = 0;
  for (let i = 0; i < n.length; i += 1) hash = (hash * 31 + n.charCodeAt(i)) >>> 0;
  const palette = ['#16a34a', '#ca8a04', '#dc2626', '#ea580c', '#2563eb', '#7c3aed', '#0d9488', '#c2410c'];
  return palette[hash % palette.length];
}

function LineChart({ series }: { series: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const height = 180;
  const pad = 24;
  const max = Math.max(...series.map((point) => point.amount), 1);
  const span = Math.max(series.length - 1, 1);

  const coords = series.map((point, index) => {
    const x = pad + (index / span) * (width - pad * 2);
    const y = height - pad - (point.amount / max) * (height - pad * 2);
    return { x, y, ...point };
  });

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-44 w-full"
        role="img"
        aria-label="Ventas en pesos por día"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width) * width;
          let best = 0;
          let bestDist = Infinity;
          for (let i = 0; i < coords.length; i += 1) {
            const dist = Math.abs(coords[i].x - x);
            if (dist < bestDist) {
              bestDist = dist;
              best = i;
            }
          }
          setHover(best);
        }}
      >
        <polyline
          fill="none"
          stroke="#166534"
          strokeWidth="2.5"
          points={coords.map((c) => `${c.x},${c.y}`).join(' ')}
        />
        {hover != null ? (
          <line
            x1={coords[hover].x}
            x2={coords[hover].x}
            y1={pad / 2}
            y2={height - pad + 4}
            stroke="#94a3b8"
            strokeDasharray="3 3"
          />
        ) : null}
        {coords.map((point, index) => (
          <circle
            key={point.date}
            cx={point.x}
            cy={point.y}
            r={hover === index ? 5.5 : 3.5}
            fill={hover === index ? '#14532d' : '#166534'}
            stroke="#fff"
            strokeWidth="1.5"
            className="cursor-pointer"
            onMouseEnter={() => setHover(index)}
          >
            <title>
              {formatChartDay(point.date)}: {formatMoney(point.amount)}
            </title>
          </circle>
        ))}
        {series.map((point, index) => {
          const x = coords[index].x;
          if (index % Math.ceil(series.length / 6) !== 0 && index !== series.length - 1) return null;
          return (
            <text key={point.date} x={x} y={height - 6} textAnchor="middle" className="fill-slate-400 text-[10px]">
              {point.date.slice(5)}
            </text>
          );
        })}
      </svg>
      <p className="mt-1 min-h-5 text-sm text-slate-600">
        {hover != null ? (
          <>
            <span className="font-medium text-slate-900">{formatChartDay(series[hover].date)}</span>
            {' · '}
            {formatMoney(series[hover].amount)}
          </>
        ) : (
          <span className="text-slate-400">Pasa el cursor sobre un día</span>
        )}
      </p>
    </div>
  );
}

function ProductBarChart({
  products,
  mode,
}: {
  products: TopProduct[];
  mode: ProductRankMode;
}) {
  const max = Math.max(...products.map((product) => Math.abs(productRankValue(product, mode))), 1);
  return (
    <div className="space-y-2.5">
      {products.map((product) => {
        const color = produceBarColor(product.name);
        const value = productRankValue(product, mode);
        return (
          <div key={product.name}>
            <div className="mb-1 flex justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2 truncate font-medium text-slate-800">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <span className="truncate">{product.name}</span>
              </span>
              <span className="tabular-nums text-slate-500">{formatProductRankValue(product, mode)}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(6, (Math.abs(value) / max) * 100)}%`,
                  backgroundColor: color,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekdayTop({ rows }: { rows: WeekdayRow[] }) {
  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <p className="text-sm font-medium text-slate-700">Mejor promedio por día</p>
      <p className="text-xs text-slate-500">
        Top 3 · cuánto venden en promedio ese día, no el total del periodo
      </p>
      <ol className="mt-2 space-y-2">
        {rows.map((row, index) => (
          <li key={row.weekday} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0">
              <span aria-hidden>{WEEKDAY_MEDALS[index] ?? `${index + 1}.`}</span>
              <span className="ml-1.5 font-medium text-slate-800">{row.label}</span>
              <span className="ml-1.5 text-xs text-slate-400">
                {row.days} día{row.days === 1 ? '' : 's'}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-semibold tabular-nums text-slate-900">
                {formatMoney(row.average)}
              </span>
              <span className="text-[11px] font-normal text-slate-400">promedio / día</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PaymentDonut({ rows }: { rows: PaymentRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  let acc = 0;
  const stops = rows
    .map((row) => {
      const start = total > 0 ? (acc / total) * 360 : 0;
      acc += row.amount;
      const end = total > 0 ? (acc / total) * 360 : 0;
      return `${PAYMENT_COLOR[row.method]} ${start}deg ${end}deg`;
    })
    .join(', ');

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <p className="text-sm font-medium text-slate-700">Por tipo de pago</p>
      <p className="text-xs text-slate-500">Del periodo · el día a día está en Caja</p>
      <div className="mt-3 flex items-center gap-4">
        <div
          className="relative h-32 w-32 shrink-0 rounded-full"
          style={{ background: `conic-gradient(${stops || '#e2e8f0 0deg 360deg'})` }}
          role="img"
          aria-label="Pastel de ventas por tipo de pago"
        >
          <div className="absolute inset-[26%] rounded-full bg-white ring-1 ring-slate-100" />
        </div>
        <ul className="min-w-0 flex-1 space-y-2">
          {rows.map((row) => (
            <li key={row.method} className="flex items-baseline justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: PAYMENT_COLOR[row.method] }}
                  aria-hidden
                />
                <span className="truncate font-medium text-slate-800">
                  {PAYMENT_METHOD_LABELS[row.method]}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-slate-500">
                {row.percent.toFixed(0)}%
                <span className="ml-1.5 hidden text-xs text-slate-400 sm:inline">
                  {formatMoney(row.amount)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function PeriodSalesCharts({
  periodLabel,
  total,
  series,
  topProducts,
  topWeekdays,
  paymentBreakdown,
}: {
  periodLabel: string;
  total: number;
  series: TrendPoint[];
  topProducts: TopProduct[];
  topWeekdays: WeekdayRow[];
  paymentBreakdown: PaymentRow[];
}) {
  const [rankMode, setRankMode] = useState<ProductRankMode>('quantity');
  const rankedProducts = useMemo(() => {
    return [...topProducts]
      .sort((a, b) => productRankValue(b, rankMode) - productRankValue(a, rankMode))
      .slice(0, PRODUCT_RANK_LIMIT);
  }, [topProducts, rankMode]);
  const activeRank = PRODUCT_RANK_MODES.find((mode) => mode.id === rankMode) ?? PRODUCT_RANK_MODES[0];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
        <p className="text-sm text-slate-500">Acumulado · {periodLabel}</p>
        <h3 className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-slate-900">
          {formatMoney(total)}
        </h3>
        <p className="mt-3 text-sm font-medium text-slate-700">Ventas por día</p>
        <p className="text-sm text-slate-500">Monto vendido en caja</p>
        <div className="mt-3">
          {series.length > 0 ? (
            <LineChart series={series} />
          ) : (
            <p className="py-10 text-sm text-slate-500">Aún no hay ventas en el periodo.</p>
          )}
        </div>
        {topWeekdays.length > 0 ? <WeekdayTop rows={topWeekdays} /> : null}
      </section>
      <section className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900">Lo que más se vende</h3>
            <p className="text-sm text-slate-500">{activeRank.hint}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5" role="group" aria-label="Ordenar productos">
            {PRODUCT_RANK_MODES.map((mode) => (
              <ActionChip
                key={mode.id}
                elevated={rankMode === mode.id}
                tone={rankMode === mode.id ? 'emerald' : 'slate'}
                onClick={() => setRankMode(mode.id)}
              >
                {mode.label}
              </ActionChip>
            ))}
          </div>
        </div>
        {rankedProducts.length > 0 ? (
          <ProductBarChart products={rankedProducts} mode={rankMode} />
        ) : (
          <p className="py-10 text-sm text-slate-500">Sin datos de productos todavía.</p>
        )}
        {paymentBreakdown.length > 0 ? <PaymentDonut rows={paymentBreakdown} /> : null}
      </section>
    </div>
  );
}
