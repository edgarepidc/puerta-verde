'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import {
  PRODUCT_UNIT_LABELS,
  formatProductQuantity,
  isLowStock,
  type ProductUnit,
} from '@puertaverde/shared';

import { ActionChip, FoldableSummary } from '@/components/ActionChip';
import { DecimalInput, parseDecimal } from '@/components/DecimalInput';
import { LowStockBanner } from '@/components/LowStockBanner';
import { ThermalPrinterChip } from '@/components/ThermalPrinterChip';
import { useThermalPrinter } from '@/components/ThermalPrinterBar';
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

export function ForecastManager({
  initialForecast,
  stockProducts = [],
}: {
  initialForecast: ForecastRow[];
  stockProducts?: StockProduct[];
}) {
  const [forecast, setForecast] = useState(initialForecast);
  const [horizonDays, setHorizonDays] = useState(7);
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
  const [openComprar, setOpenComprar] = useState(true);
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
        href="/compras"
        persist
        linkLabel="Ir a comprar"
      />

      <details
        className="group pv-glass-card space-y-4 p-4 sm:p-6"
        open={openComprar}
        onToggle={(event) => setOpenComprar(event.currentTarget.open)}
      >
        <FoldableSummary
          title="Qué comprar"
          hint={
            onlyUrgent
              ? `${sortedRows.length} urgentes (stock bajo, se acaba pronto o hay que reponer)`
              : `${sortedRows.length} productos · urgentes primero`
          }
          emoji="🛒"
          iconClass="bg-emerald-100"
          actions={
            <>
              <input
                type="search"
                className="h-9 w-36 rounded-full border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-slate-400 sm:w-44"
                placeholder="Buscar…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Buscar producto"
              />
              <ActionChip emoji="🔄" disabled={loading} onClick={() => void refresh()}>
                {loading ? '…' : 'Actualizar'}
              </ActionChip>
              <ActionChip emoji="✨" disabled={loading} onClick={() => void generateInsights()}>
                Resumen IA
              </ActionChip>
              <ActionChip
                tone="emerald"
                emoji="🖨️"
                disabled={printRows.length === 0}
                onClick={openPrintList}
              >
                Imprimir lista
              </ActionChip>
            </>
          }
        />

        {restCount > 0 ? (
          <ActionChip
            emoji={onlyUrgent ? '📋' : '⚠️'}
            tone={onlyUrgent ? 'slate' : 'emerald'}
            onClick={() => setOnlyUrgent((v) => !v)}
          >
            {onlyUrgent ? `Ver el resto (${restCount})` : 'Solo urgentes'}
          </ActionChip>
        ) : null}

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
                <ActionChip elevated={false} onClick={() => setPrintOpen(false)}>
                  Cerrar
                </ActionChip>
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
              <ActionChip emoji="✅" tone="emerald" onClick={() => applyTopSelect(parseDecimal(printSelectCount, 12))}>
                Aplicar
              </ActionChip>
              <ActionChip emoji="📋" onClick={() => applyTopSelect(printRows.length)}>
                Todos ({printRows.length})
              </ActionChip>
              <ActionChip elevated={false} onClick={() => applyTopSelect(0)}>
                Ninguno
              </ActionChip>
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
              <ActionChip
                size="lg"
                emoji="🖨️"
                tone="emerald"
                disabled={printBusy}
                onClick={() => void handlePrintThermal()}
              >
                {printBusy
                  ? 'Imprimiendo…'
                  : printerStatus === 'ready'
                    ? 'Imprimir ticket'
                    : 'Imprimir en térmica'}
              </ActionChip>
              <ActionChip emoji="📄" disabled={printBusy} onClick={handlePrintBrowser}>
                Imprimir / PDF
              </ActionChip>
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
                          <Link href={`/compras?tab=compra&product=${row.branch_product_id}`}>
                            <ActionChip as="span" tone="emerald" emoji="🛒">
                              Comprar
                            </ActionChip>
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

        {insights ? (
          <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <h3 className="font-semibold text-emerald-950">Recomendaciones</h3>
            <p className="mt-2 whitespace-pre-line text-sm text-emerald-900">{insights}</p>
          </section>
        ) : null}
      </details>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
