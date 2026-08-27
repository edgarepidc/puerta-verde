'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import {
  PRODUCT_UNIT_LABELS,
  formatMoney,
  formatProductQuantity,
  isLowStock,
  type ProductUnit,
} from '@puertaverde/shared';

import { DecimalInput, parseDecimal } from '@/components/DecimalInput';
import { LowStockBanner } from '@/components/LowStockBanner';
import { ThermalPrinterChip } from '@/components/ThermalPrinterChip';
import { useThermalPrinter } from '@/components/ThermalPrinterBar';
import {
  currentMexicoMonthRange,
  formatMexicoPeriodLabel,
  previousMexicoMonthRange,
  todayMexicoYmd,
} from '@/lib/mexico-date';
import { getThermalPrinterStatus, printThermalShoppingList } from '@/lib/thermal-printer';
import type { ShoppingListItem } from '@/lib/thermal-ticket';

interface ForecastRow {
  branch_product_id: string;
  product_name: string;
  unit: ProductUnit;
  current_stock: number;
  min_stock: number;
  avg_daily_sales: number;
  forecast_demand: number;
  suggested_reorder: number;
  days_until_stockout: number | null;
}

interface StockProduct {
  id: string;
  stock: number;
  min_stock?: number | null;
  product: {
    name: string;
    unit?: ProductUnit;
    category?: { name?: string | null } | null;
  };
}

interface TrendPoint {
  date: string;
  amount: number;
}

interface TopProduct {
  name: string;
  quantity: number;
}

type PeriodPreset = 'current' | 'previous' | 'custom';

const PRESET_LABELS: Record<PeriodPreset, string> = {
  current: 'Mes en curso',
  previous: 'Mes anterior',
  custom: 'Personalizado',
};

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

function isBelowMin(row: ForecastRow) {
  return isLowStock({
    stock: Number(row.current_stock),
    unit: row.unit,
    minStock: row.min_stock,
    name: row.product_name,
  });
}

function isUrgent(row: ForecastRow) {
  return (
    isBelowMin(row) ||
    Number(row.suggested_reorder) > 0 ||
    (row.days_until_stockout != null && row.days_until_stockout <= 3)
  );
}

function urgencyRank(row: ForecastRow) {
  if (isBelowMin(row)) return -1;
  if (row.days_until_stockout != null) return row.days_until_stockout;
  if (Number(row.suggested_reorder) > 0) return 99;
  return 999;
}

function defaultBuyQty(row: ForecastRow) {
  const suggested = Number(row.suggested_reorder);
  if (suggested > 0) return suggested;
  if (!isBelowMin(row)) return 0;
  return Math.max(0, Number(row.min_stock) - Number(row.current_stock));
}

function qtyLabel(qty: number, unit: ProductUnit) {
  const rounded = Number(Number(qty).toFixed(2));
  return formatProductQuantity(rounded, unit);
}

function daysLeftLabel(row: ForecastRow) {
  if (row.days_until_stockout == null) {
    return isBelowMin(row) ? 'Bajo el mínimo' : '—';
  }
  const days = Number(row.days_until_stockout);
  if (days <= 0) return 'Hoy';
  if (days === 1) return '1 día';
  return `${days} días`;
}

function printBrowserList(opts: {
  storeName: string;
  horizonDays: number;
  items: ShoppingListItem[];
}) {
  const rows = opts.items
    .filter((item) => Number(item.buyQty) > 0)
    .map((item) => {
      const unit = (item.unit as ProductUnit | undefined) ?? 'kg';
      return `<tr>
        <td>${escapeHtml(item.product_name)}</td>
        <td>${escapeHtml(qtyLabel(Number(item.stock), unit))}</td>
        <td><strong>${escapeHtml(qtyLabel(Number(item.buyQty), unit))}</strong></td>
      </tr>`;
    })
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Lista de compra</title>
<style>
  body{font-family:system-ui,sans-serif;padding:24px;color:#0f172a}
  h1{font-size:18px;margin:0 0 4px}
  p{margin:0 0 16px;color:#64748b;font-size:13px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{border-bottom:1px solid #e2e8f0;padding:8px 6px;text-align:left}
  th{font-size:11px;text-transform:uppercase;color:#64748b}
  td:nth-child(2),td:nth-child(3),th:nth-child(2),th:nth-child(3){text-align:right}
</style></head><body>
  <h1>${escapeHtml(opts.storeName)} · Lista de compra</h1>
  <p>${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })} · Horizonte ${opts.horizonDays} días</p>
  <table><thead><tr><th>Producto</th><th>Hay</th><th>Comprar</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="3">Sin artículos</td></tr>'}</tbody></table>
  <script>window.onload=()=>{window.print();}</script>
</body></html>`;
  const win = window.open('', '_blank', 'noopener,noreferrer,width=720,height=900');
  if (!win) throw new Error('Permite ventanas emergentes para imprimir.');
  win.document.write(html);
  win.document.close();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function BarChart({ products }: { products: TopProduct[] }) {
  const max = Math.max(...products.map((product) => product.quantity), 1);
  return (
    <div className="space-y-2.5">
      {products.map((product) => {
        const color = produceBarColor(product.name);
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
              <span className="tabular-nums text-slate-500">{Number(product.quantity.toFixed(2))}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(6, (product.quantity / max) * 100)}%`,
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

export function ForecastManager({
  initialForecast,
  stockProducts = [],
}: {
  initialForecast: ForecastRow[];
  stockProducts?: StockProduct[];
}) {
  const initialRange = currentMexicoMonthRange();
  const [forecast, setForecast] = useState(initialForecast);
  const [horizonDays, setHorizonDays] = useState(7);
  const [from, setFrom] = useState(initialRange.start);
  const [to, setTo] = useState(initialRange.end);
  const [preset, setPreset] = useState<PeriodPreset>('current');
  const [periodLabel, setPeriodLabel] = useState(() =>
    formatMexicoPeriodLabel(initialRange.start, initialRange.end),
  );
  const [series, setSeries] = useState<TrendPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [insights, setInsights] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyUrgent, setOnlyUrgent] = useState(true);
  const [search, setSearch] = useState('');
  const [printOpen, setPrintOpen] = useState(false);
  const [printQty, setPrintQty] = useState<Record<string, string>>({});
  const [printIncluded, setPrintIncluded] = useState<Record<string, boolean>>({});
  const [printSelectCount, setPrintSelectCount] = useState('12');
  const [printBusy, setPrintBusy] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const { status: printerStatus } = useThermalPrinter();

  const bannerProducts = useMemo(() => {
    if (stockProducts.length > 0) return stockProducts;
    return forecast.map((row) => ({
      id: row.branch_product_id,
      stock: Number(row.current_stock),
      min_stock: Number(row.min_stock),
      product: { name: row.product_name, unit: row.unit },
    }));
  }, [stockProducts, forecast]);

  async function refreshTrends(nextFrom = from, nextTo = to) {
    const response = await fetch(`/api/forecast/trends?${qs(nextFrom, nextTo)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'Error al cargar tendencias');
    setSeries(payload.series ?? []);
    setTopProducts(payload.topProducts ?? []);
    setFrom(payload.from ?? nextFrom);
    setTo(payload.to ?? nextTo);
    setPeriodLabel(payload.periodLabel ?? formatMexicoPeriodLabel(nextFrom, nextTo));
    setPreset(detectPreset(payload.from ?? nextFrom, payload.to ?? nextTo));
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
        refreshTrends(from, to),
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
    const range = currentMexicoMonthRange();
    refreshTrends(range.start, range.end).catch(() => {
      /* ignore first-load chart errors; table still useful */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPreset(next: PeriodPreset) {
    setPreset(next);
    if (next === 'current') {
      const range = currentMexicoMonthRange();
      setFrom(range.start);
      setTo(range.end);
      void refreshTrends(range.start, range.end);
      return;
    }
    if (next === 'previous') {
      const range = previousMexicoMonthRange();
      setFrom(range.start);
      setTo(range.end);
      void refreshTrends(range.start, range.end);
    }
  }

  const lowStockCount = useMemo(() => forecast.filter(isBelowMin).length, [forecast]);
  const urgentCount = useMemo(() => forecast.filter(isUrgent).length, [forecast]);
  const reorderCount = useMemo(
    () => forecast.filter((r) => Number(r.suggested_reorder) > 0).length,
    [forecast],
  );

  const sortedRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...forecast]
      .filter((row) => {
        if (onlyUrgent && !isUrgent(row)) return false;
        if (!q) return true;
        return row.product_name.toLowerCase().includes(q);
      })
      .sort((a, b) => urgencyRank(a) - urgencyRank(b) || b.suggested_reorder - a.suggested_reorder);
  }, [forecast, onlyUrgent, search]);

  const restCount = useMemo(() => {
    const q = search.trim().toLowerCase();
    return forecast.filter((row) => {
      if (isUrgent(row)) return false;
      if (!q) return true;
      return row.product_name.toLowerCase().includes(q);
    }).length;
  }, [forecast, search]);

  const totalTrend = useMemo(
    () => series.reduce((sum, point) => sum + point.amount, 0),
    [series],
  );

  const printRows = useMemo(() => {
    return [...forecast].sort(
      (a, b) => urgencyRank(a) - urgencyRank(b) || b.suggested_reorder - a.suggested_reorder,
    );
  }, [forecast]);

  function applyTopSelect(count: number, qtySeed?: Record<string, string>) {
    const n = Math.max(0, Math.min(Math.floor(count), printRows.length));
    const included: Record<string, boolean> = {};
    const qty = { ...(qtySeed ?? printQty) };
    printRows.forEach((row, index) => {
      const id = row.branch_product_id;
      const selected = index < n;
      included[id] = selected;
      if (selected && !(qty[id]?.trim())) {
        const buy = defaultBuyQty(row);
        qty[id] = buy > 0 ? String(Number(buy.toFixed(2))) : '';
      }
    });
    setPrintIncluded(included);
    setPrintQty(qty);
    setPrintSelectCount(String(n));
  }

  function openPrintList() {
    const qty: Record<string, string> = {};
    for (const row of printRows) {
      const buy = defaultBuyQty(row);
      qty[row.branch_product_id] = buy > 0 ? String(Number(buy.toFixed(2))) : '';
    }
    setPrintError(null);
    setPrintOpen(true);
    const requested = Math.max(1, Math.floor(parseDecimal(printSelectCount, 12)) || 12);
    // Seed qty first, then select top N by urgency.
    setPrintQty(qty);
    const n = Math.max(0, Math.min(requested, printRows.length));
    const included: Record<string, boolean> = {};
    printRows.forEach((row, index) => {
      included[row.branch_product_id] = index < n;
    });
    setPrintIncluded(included);
    setPrintSelectCount(String(n));
  }

  function buildPrintItems(): ShoppingListItem[] {
    return printRows
      .filter((row) => printIncluded[row.branch_product_id])
      .map((row) => ({
        product_name: row.product_name,
        unit: row.unit,
        stock: Number(row.current_stock),
        buyQty: parseDecimal(printQty[row.branch_product_id] ?? '', 0),
      }))
      .filter((item) => item.buyQty > 0);
  }

  async function handlePrintThermal() {
    setPrintBusy(true);
    setPrintError(null);
    try {
      const items = buildPrintItems();
      if (items.length === 0) throw new Error('Marca al menos un producto con cantidad a comprar.');
      await printThermalShoppingList(
        { horizonDays, items, printedAt: new Date().toISOString() },
        { connectIfNeeded: getThermalPrinterStatus() !== 'ready' },
      );
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'No se pudo imprimir.');
    } finally {
      setPrintBusy(false);
    }
  }

  function handlePrintBrowser() {
    setPrintError(null);
    try {
      const items = buildPrintItems();
      if (items.length === 0) throw new Error('Marca al menos un producto con cantidad a comprar.');
      printBrowserList({ storeName: 'Puerta Verde', horizonDays, items });
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'No se pudo imprimir.');
    }
  }

  return (
    <div className="space-y-6">
      <LowStockBanner
        products={bannerProducts}
        href="/inventario"
        persist
        linkLabel="Ir a comprar"
      />

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="pv-glass-card flex gap-3 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xl" aria-hidden>
            ⚠️
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Stock bajo</p>
            <p className="mt-0.5 text-xl font-bold text-amber-800">{lowStockCount}</p>
            <p className="text-xs text-slate-500">Bajo el mínimo configurado</p>
          </div>
        </div>
        <div className="pv-glass-card flex gap-3 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xl" aria-hidden>
            ⏳
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Urgentes</p>
            <p className="mt-0.5 text-xl font-bold text-rose-800">{urgentCount}</p>
            <p className="text-xs text-slate-500">Mínimo, agotarse o reponer</p>
          </div>
        </div>
        <div className="pv-glass-card flex gap-3 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xl" aria-hidden>
            🛒
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">A reponer</p>
            <p className="mt-0.5 text-xl font-bold text-slate-900">{reorderCount}</p>
            <p className="text-xs text-slate-500">Sugerencia en {horizonDays} días</p>
          </div>
        </div>
        <div className="pv-glass-card flex gap-3 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xl" aria-hidden>
            📊
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ventas periodo</p>
            <p className="mt-0.5 text-xl font-bold text-emerald-800">{formatMoney(totalTrend)}</p>
            <p className="text-xs text-slate-500">{periodLabel}</p>
          </div>
        </div>
      </section>

      <section className="pv-glass-card space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">Periodo de transacciones</h2>
            <p className="text-sm text-slate-500">{periodLabel}</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-slate-600">
              Horizonte
              <input
                type="number"
                min={1}
                max={30}
                className="pv-input mt-1 block w-20 text-sm"
                value={horizonDays}
                onChange={(e) => setHorizonDays(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              disabled={loading}
              onClick={() => void refresh()}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 disabled:opacity-50"
            >
              {loading ? '…' : 'Actualizar'}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void generateInsights()}
              className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Resumen IA
            </button>
          </div>
        </div>
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
        {preset === 'custom' ? (
          <div className="flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-3">
            <label className="text-xs font-medium text-slate-600">
              Desde
              <input
                type="date"
                max={todayMexicoYmd()}
                className="pv-input mt-1 block text-sm"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Hasta
              <input
                type="date"
                max={todayMexicoYmd()}
                className="pv-input mt-1 block text-sm"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={loading}
              onClick={() => void refreshTrends(from, to)}
              className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Aplicar rango
            </button>
          </div>
        ) : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="pv-glass-card p-5">
          <p className="text-sm text-slate-500">Acumulado · {periodLabel}</p>
          <h2 className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-slate-900">
            {formatMoney(totalTrend)}
          </h2>
          <p className="mt-3 text-sm font-medium text-slate-700">Ventas por día</p>
          <p className="text-sm text-slate-500">Monto vendido en caja</p>
          <div className="mt-3">
            {series.length > 0 ? (
              <LineChart series={series} />
            ) : (
              <p className="py-10 text-sm text-slate-500">Aún no hay ventas en el periodo.</p>
            )}
          </div>
        </section>
        <section className="pv-glass-card p-5">
          <h2 className="font-semibold text-slate-900">Lo que más se vende</h2>
          <p className="mb-3 text-sm text-slate-500">Prioriza comprar lo que rota</p>
          {topProducts.length > 0 ? (
            <BarChart products={topProducts} />
          ) : (
            <p className="py-10 text-sm text-slate-500">Sin datos de productos todavía.</p>
          )}
        </section>
      </div>

      {insights ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="font-semibold text-emerald-950">Recomendaciones</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-emerald-900">{insights}</p>
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Qué hay y qué comprar</h2>
            <p className="text-sm text-slate-500">
              {onlyUrgent
                ? `${sortedRows.length} urgentes (stock bajo, se acaba pronto o hay que reponer)`
                : `${sortedRows.length} productos · urgentes primero`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="pv-input w-40 text-sm"
              placeholder="Buscar producto…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {restCount > 0 ? (
              <button
                type="button"
                onClick={() => setOnlyUrgent((v) => !v)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  onlyUrgent
                    ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    : 'bg-amber-600 text-white'
                }`}
              >
                {onlyUrgent ? `Ver el resto (${restCount})` : 'Solo urgentes'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={openPrintList}
              disabled={printRows.length === 0}
              className="rounded-full bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Imprimir lista
            </button>
          </div>
        </div>

        {printOpen ? (
          <section className="space-y-3 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">Ticket / lista de compra</h3>
                <p className="text-sm text-slate-500">
                  Marca los más urgentes en bloque (por defecto 12) o ajusta producto por producto.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ThermalPrinterChip />
                <button
                  type="button"
                  onClick={() => setPrintOpen(false)}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <label className="flex items-center gap-1.5 font-semibold text-slate-700">
                Seleccionar
                <input
                  type="number"
                  min={0}
                  max={printRows.length}
                  className="pv-input w-16 py-1 text-center text-sm"
                  value={printSelectCount}
                  onChange={(e) => setPrintSelectCount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyTopSelect(parseDecimal(printSelectCount, 12));
                    }
                  }}
                  aria-label="Cuántos productos marcar"
                />
              </label>
              <button
                type="button"
                className="rounded-full bg-emerald-800 px-2.5 py-1 font-semibold text-white"
                onClick={() => applyTopSelect(parseDecimal(printSelectCount, 12))}
              >
                Aplicar
              </button>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold"
                onClick={() => applyTopSelect(printRows.length)}
              >
                Todos ({printRows.length})
              </button>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold"
                onClick={() => applyTopSelect(0)}
              >
                Ninguno
              </button>
            </div>

            <div className="max-h-[28rem] overflow-auto rounded-xl border border-slate-100">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Incluir</th>
                    <th className="px-3 py-2 font-semibold">Producto</th>
                    <th className="px-3 py-2 text-right font-semibold">Hay</th>
                    <th className="px-3 py-2 text-right font-semibold">Sugerido</th>
                    <th className="px-3 py-2 text-right font-semibold">Imprimir</th>
                  </tr>
                </thead>
                <tbody>
                  {printRows.map((row) => {
                    const id = row.branch_product_id;
                    const suggested = defaultBuyQty(row);
                    return (
                      <tr key={id} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={Boolean(printIncluded[id])}
                            onChange={(e) =>
                              setPrintIncluded((prev) => ({ ...prev, [id]: e.target.checked }))
                            }
                            aria-label={`Incluir ${row.product_name}`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-slate-900">{row.product_name}</p>
                          <p className="text-[11px] text-slate-500">{PRODUCT_UNIT_LABELS[row.unit]}</p>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                          {qtyLabel(Number(row.current_stock), row.unit)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                          {suggested > 0 ? qtyLabel(suggested, row.unit) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <DecimalInput
                            className="pv-input ml-auto w-24 text-right text-sm"
                            value={printQty[id] ?? ''}
                            disabled={!printIncluded[id]}
                            onChange={(value) => setPrintQty((prev) => ({ ...prev, [id]: value }))}
                            aria-label={`Cantidad a comprar de ${row.product_name}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={printBusy}
                onClick={() => void handlePrintThermal()}
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {printBusy
                  ? 'Imprimiendo…'
                  : printerStatus === 'ready'
                    ? 'Imprimir ticket'
                    : 'Imprimir en térmica'}
              </button>
              <button
                type="button"
                disabled={printBusy}
                onClick={handlePrintBrowser}
                className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 disabled:opacity-50"
              >
                Imprimir / PDF
              </button>
              {printError ? <p className="text-sm text-red-600">{printError}</p> : null}
            </div>
          </section>
        ) : null}

        {sortedRows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
            {onlyUrgent
              ? 'Nada urgente por ahora. Pulsa Ver el resto para ver el catálogo.'
              : 'Sin datos de pronóstico todavía.'}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Producto</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Hay ahora</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Mínimo</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Se acaba en</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Se vende al día</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Comprar</th>
                  <th className="px-3 py-2.5 font-semibold"> </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => {
                  const stock = Number(row.current_stock);
                  const minStock = Number(row.min_stock) || 0;
                  const reorder = Number(row.suggested_reorder);
                  const below = isBelowMin(row);
                  const urgent = isUrgent(row);
                  return (
                    <tr
                      key={row.branch_product_id}
                      className={`border-t border-slate-100 ${
                        below ? 'bg-amber-50/80' : urgent ? 'bg-rose-50/40' : ''
                      }`}
                    >
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-900">{row.product_name}</p>
                        <p className="text-[11px] text-slate-500">{PRODUCT_UNIT_LABELS[row.unit]}</p>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-900">
                        {qtyLabel(stock, row.unit)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                        {minStock > 0 ? qtyLabel(minStock, row.unit) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-700">{daysLeftLabel(row)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                        {qtyLabel(Number(row.avg_daily_sales), row.unit)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-900">
                        {reorder > 0 ? qtyLabel(reorder, row.unit) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {reorder > 0 || below ? (
                          <Link
                            href={`/inventario?tab=compra&product=${row.branch_product_id}`}
                            className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100"
                          >
                            Comprar
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
