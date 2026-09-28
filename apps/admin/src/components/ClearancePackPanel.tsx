'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  CLEARANCE_PACK_DEFAULT_TITLE,
  PRODUCT_UNIT_LABELS,
  formatDecimal,
  formatMoney,
  type ProductUnit,
} from '@puertaverde/shared';

import { ActionChip, ChevronDownIcon } from '@/components/ActionChip';
import { DecimalInput, decimalFromNumber, parseDecimal } from '@/components/DecimalInput';
import { ProductSearchSelect } from '@/components/ProductSearchSelect';
import { ScalePanel } from '@/components/ScalePanel';

export interface ClearanceIngredientProduct {
  id: string;
  price: number;
  stock: number;
  min_stock?: number | null;
  product: {
    id: string;
    name: string;
    unit: ProductUnit;
    sku?: string | null;
    pos_only?: boolean;
  };
}

export interface ActiveClearancePack {
  id: string;
  title: string;
  price: number;
  quantity_remaining: number;
  branch_product_id: string;
}

interface PackLine {
  branchProductId: string;
  quantity: string;
}

export function ClearancePackPanel({
  open,
  onClose,
  products,
  usbScaleEnabled = false,
  initialItems = [],
  onAssembled,
}: {
  open: boolean;
  onClose: () => void;
  products: ClearanceIngredientProduct[];
  usbScaleEnabled?: boolean;
  initialItems?: Array<{ branchProductId: string; quantity: number }>;
  onAssembled: (payload: {
    product: ClearanceIngredientProduct;
    pack: ActiveClearancePack;
    broadcastError?: string | null;
  }) => void;
}) {
  const ingredients = useMemo(
    () => products.filter((product) => !product.product.pos_only),
    [products],
  );
  const [lines, setLines] = useState<PackLine[]>([]);
  const [pickerId, setPickerId] = useState('');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [bagCount, setBagCount] = useState('3');
  const [price, setPrice] = useState('50');
  const [notifyNeighbors, setNotifyNeighbors] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);
    setPickerId('');
    if (initialItems.length) {
      setLines(
        initialItems.map((item) => ({
          branchProductId: item.branchProductId,
          quantity: decimalFromNumber(item.quantity, false),
        })),
      );
      setFocusedId(initialItems[0]?.branchProductId ?? null);
    } else {
      setLines([]);
      setFocusedId(null);
    }
  }, [open, initialItems]);

  const productById = useMemo(
    () => new Map(ingredients.map((product) => [product.id, product])),
    [ingredients],
  );

  function addPicked(id: string) {
    if (!id) return;
    setPickerId('');
    setLines((current) => {
      if (current.some((line) => line.branchProductId === id)) return current;
      return [...current, { branchProductId: id, quantity: '' }];
    });
    setFocusedId(id);
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/clearance-packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: CLEARANCE_PACK_DEFAULT_TITLE,
          price: parseDecimal(price),
          bagCount: Math.round(parseDecimal(bagCount)),
          notifyNeighbors,
          items: lines
            .map((line) => ({
              branchProductId: line.branchProductId,
              quantity: parseDecimal(line.quantity),
            }))
            .filter((line) => line.quantity > 0),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo armar');
      if (!payload.product || !payload.pack) throw new Error('No se pudo armar');
      onAssembled({
        product: payload.product,
        pack: payload.pack,
        broadcastError: payload.broadcastError ?? null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo armar el paquete');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="pv-modal-overlay fixed inset-0 z-[85] flex items-center justify-center p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="clearance-pack-title"
        className="pv-glass-card max-h-[90vh] w-full max-w-lg overflow-y-auto p-5 shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="clearance-pack-title" className="text-lg font-semibold text-slate-900">
              Armar paquete
            </h2>
            <p className="text-sm text-slate-500">
              Pesa lo que metes en todas las bolsas. Se vende a precio fijo en mostrador.
            </p>
          </div>
          <ActionChip
            icon={
              <span className="inline-flex rotate-180">
                <ChevronDownIcon />
              </span>
            }
            onClick={onClose}
          >
            Cerrar
          </ActionChip>
        </div>

        {usbScaleEnabled ? (
          <div className="mt-3">
            <ScalePanel
              onWeight={(kg) => {
                if (!focusedId) return;
                setLines((current) =>
                  current.map((line) =>
                    line.branchProductId === focusedId
                      ? { ...line, quantity: String(Number(kg.toFixed(3))) }
                      : line,
                  ),
                );
              }}
            />
          </div>
        ) : null}

        <div className="mt-4">
          <ProductSearchSelect
            products={ingredients.filter(
              (product) => !lines.some((line) => line.branchProductId === product.id),
            )}
            value={pickerId}
            onChange={addPicked}
            placeholder="Agregar fruta o verdura…"
          />
        </div>

        <ul className="mt-3 space-y-2">
          {lines.length === 0 ? (
            <li className="text-sm text-slate-500">Agrega lo que va en las bolsas.</li>
          ) : (
            lines.map((line) => {
              const product = productById.get(line.branchProductId);
              if (!product) return null;
              const unit = PRODUCT_UNIT_LABELS[product.product.unit];
              const focused = focusedId === line.branchProductId;
              return (
                <li
                  key={line.branchProductId}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                    focused ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setFocusedId(line.branchProductId)}
                  >
                    <p className="truncate text-sm font-medium text-slate-900">
                      {product.product.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      Hay {formatDecimal(Number(product.stock))} {unit}
                    </p>
                  </button>
                  <label className="flex shrink-0 items-center gap-1 text-sm">
                    <DecimalInput
                      className="pv-input w-20! px-1.5! py-1.5 text-center"
                      value={line.quantity}
                      onChange={(value) =>
                        setLines((current) =>
                          current.map((row) =>
                            row.branchProductId === line.branchProductId
                              ? { ...row, quantity: value }
                              : row,
                          ),
                        )
                      }
                      onFocus={() => setFocusedId(line.branchProductId)}
                      placeholder="0"
                    />
                    <span className="text-xs text-slate-500">{unit}</span>
                  </label>
                  <button
                    type="button"
                    className="text-xs text-slate-400 hover:text-rose-700"
                    onClick={() =>
                      setLines((current) =>
                        current.filter((row) => row.branchProductId !== line.branchProductId),
                      )
                    }
                  >
                    Quitar
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Bolsas</span>
            <DecimalInput className="pv-input mt-1" value={bagCount} onChange={setBagCount} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Precio por bolsa</span>
            <DecimalInput className="pv-input mt-1" value={price} onChange={setPrice} />
          </label>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={notifyNeighbors}
            onChange={(event) => setNotifyNeighbors(event.target.checked)}
          />
          Avisar a vecinos por WhatsApp y cartel
        </label>

        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <ActionChip tone="amber" emoji="🧺" disabled={saving || lines.length === 0} onClick={() => void submit()}>
            {saving
              ? 'Armando…'
              : `Armar ${Math.max(0, Math.round(parseDecimal(bagCount))) || ''} a ${
                  parseDecimal(price) > 0 ? formatMoney(parseDecimal(price)) : '$—'
                }`}
          </ActionChip>
        </div>
      </section>
    </div>
  );
}
