'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  PRODUCT_UNIT_LABELS,
  applyPriceAdjustment,
  formatMoney,
  suggestSalePrice,
  type MarketOffer,
  type ProductUnit,
} from '@puertaverde/shared';

import { DecimalInput, parseDecimal } from '@/components/DecimalInput';

export function MarketComparePanel({
  productName,
  unit,
  currentPrice,
  cost = 0,
  onPriceChange,
  compact = false,
  autoSearch = false,
  currentPriceLabel = 'Precio actual',
  className = '',
}: {
  productName: string;
  unit: ProductUnit;
  currentPrice: number;
  cost?: number;
  onPriceChange: (price: number) => void;
  compact?: boolean;
  autoSearch?: boolean;
  currentPriceLabel?: string;
  className?: string;
}) {
  const [query, setQuery] = useState(productName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [offers, setOffers] = useState<MarketOffer[]>([]);
  const [sources, setSources] = useState<{
    walmart: boolean;
    chedraui: boolean;
    lacomer: boolean;
  } | null>(null);
  const [selectedId, setSelectedId] = useState('current');
  const [adjustKind, setAdjustKind] = useState<'amount' | 'percent'>('percent');
  const [adjustValue, setAdjustValue] = useState('');
  const searchSeq = useRef(0);

  useEffect(() => {
    if (productName.trim()) setQuery(productName);
  }, [productName]);

  const suggested = useMemo(
    () =>
      suggestSalePrice({
        cost,
        currentPrice,
        marketPrices: offers.map((offer) => offer.price),
      }),
    [cost, currentPrice, offers],
  );

  const suggestedHint = offers.length
    ? '10% debajo del precio más bajo encontrado.'
    : cost > 0
      ? 'Costo + 35% de margen, hasta que haya precios de súper.'
      : 'Sin costo ni precios de súper aún; usa tu precio actual o búscalos.';

  const bases = useMemo(
    () => [
      {
        id: 'current',
        storeLabel: currentPriceLabel,
        title: `Tu precio de venta / ${PRODUCT_UNIT_LABELS[unit]}`,
        price: currentPrice,
      },
      { id: 'suggested', storeLabel: 'Sugerido', title: suggestedHint, price: suggested },
      ...offers.map((offer, index) => ({
        id: `offer-${index}`,
        storeLabel: offer.storeLabel,
        title: offer.title,
        price: offer.price,
        url: offer.url,
      })),
    ],
    [currentPrice, currentPriceLabel, offers, suggested, suggestedHint, unit],
  );

  const selected = bases.find((item) => item.id === selectedId) ?? bases[0];
  const adjusted = applyPriceAdjustment(
    selected?.price ?? 0,
    adjustKind,
    parseDecimal(adjustValue),
  );

  async function runSearch(rawQuery: string, { silentEmpty = false } = {}) {
    const q = rawQuery.trim();
    if (q.length < 2) {
      if (!silentEmpty) setError('Escribe el nombre del producto para buscar.');
      return;
    }
    const seq = ++searchSeq.current;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/market/search?q=${encodeURIComponent(q)}`);
      const payload = await response.json();
      if (seq !== searchSeq.current) return;
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo buscar');
      const nextOffers = (payload.offers ?? []) as MarketOffer[];
      setOffers(nextOffers);
      setSources(payload.sources ?? null);
      if (!nextOffers.length) {
        setMessage(
          'No se encontraron precios en súper. Puedes ajustar tu precio actual o el sugerido.',
        );
      }
    } catch (err) {
      if (seq !== searchSeq.current) return;
      setError(err instanceof Error ? err.message : 'Error al buscar precios');
    } finally {
      if (seq === searchSeq.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (!autoSearch) return;
    const q = productName.trim();
    if (q.length < 2) return;
    const handle = window.setTimeout(() => {
      void runSearch(q, { silentEmpty: true });
    }, 500);
    return () => {
      window.clearTimeout(handle);
      searchSeq.current += 1;
    };
  }, [autoSearch, productName]);

  async function search() {
    await runSearch(query.trim() || productName.trim());
  }

  function applyPrice() {
    const next = Math.round(adjusted);
    onPriceChange(next);
    setMessage(`Precio actualizado a ${formatMoney(next)}.`);
  }

  return (
    <div
      className={`space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 ${
        compact ? 'p-3' : 'p-4'
      } ${className}`.trim()}
    >
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Comparar mercado</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          {compact
            ? 'Para no poner el precio a ciegas: busca en súper, elige una opción y úsala como precio de tienda.'
            : 'Por defecto queda tu precio actual. También puedes elegir el sugerido o un resultado de Walmart, Chedraui o La Comer y ajustarlo por % o $.'}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Buscar como</span>
          <input
            className="pv-input mt-1"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ej. Aguacate Hass kg"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            disabled={loading}
            onClick={search}
            className="pv-btn-primary w-full px-4 py-2 text-sm disabled:opacity-50 sm:w-auto"
          >
            {loading ? 'Buscando…' : 'Buscar en súper'}
          </button>
        </div>
      </div>

      <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
        Costo
        <span className="mt-1 block font-semibold text-slate-900">
          {cost > 0
            ? formatMoney(cost)
            : compact
              ? 'Aún no hay costo en esta partida'
              : 'Sin compras aún'}
        </span>
      </p>

      {sources && (
        <p className="text-xs text-slate-500">
          Walmart {sources.walmart ? 'sí' : 'no'} · Chedraui {sources.chedraui ? 'sí' : 'no'} · La
          Comer {sources.lacomer ? 'sí' : 'no'}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
        <p className="border-b border-slate-100 px-3 py-2 text-xs font-medium text-slate-500">
          Base del precio — elige una opción
        </p>
        <ul>
          {bases.map((item) => {
            const active = selected?.id === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left text-sm ${
                    active ? 'bg-emerald-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className="flex min-w-0 items-start gap-2">
                    <span
                      className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border ${
                        active ? 'border-emerald-700 bg-emerald-700' : 'border-slate-300 bg-white'
                      }`}
                    />
                    <span className="min-w-0">
                      <span className="font-medium text-slate-900">{item.storeLabel}</span>
                      <span className="mt-0.5 block text-xs text-slate-600">{item.title}</span>
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{formatMoney(item.price)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Ajuste sobre la opción elegida</span>
          <select
            className="pv-input mt-1"
            value={adjustKind}
            onChange={(e) => setAdjustKind(e.target.value as 'amount' | 'percent')}
          >
            <option value="percent">Porcentaje (%)</option>
            <option value="amount">Pesos ($)</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">
            {adjustKind === 'percent' ? 'Ej. -5 o 10' : 'Ej. -2 o 5'}
          </span>
          <DecimalInput
            placeholder={adjustKind === 'percent' ? '-5' : '-2'}
            className="pv-input mt-1"
            value={adjustValue}
            onChange={setAdjustValue}
          />
        </label>
        <p className="rounded-xl bg-slate-900 px-4 py-2 text-center text-sm font-semibold text-white">
          Final: {formatMoney(adjusted)}
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-700">{message}</p>}

      <button
        type="button"
        onClick={applyPrice}
        className={
          compact
            ? 'pv-btn-primary px-4 py-2 text-sm'
            : 'pv-btn-secondary px-4 py-2 text-sm'
        }
      >
        Usar este precio
      </button>
    </div>
  );
}
