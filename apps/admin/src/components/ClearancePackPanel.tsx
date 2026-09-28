'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  CLEARANCE_PACK_DEFAULT_TITLE,
  PRODUCT_UNIT_LABELS,
  formatDecimal,
  formatMoney,
  isWeighProduce,
  perBagFromTotal,
  preloadPackTemplate,
  totalFromPerBag,
  type ClearancePackTemplate,
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
  piece_stock?: number | null;
  min_stock?: number | null;
  product: {
    id: string;
    name: string;
    unit: ProductUnit;
    sku?: string | null;
    pos_only?: boolean;
    weigh_at_fulfillment?: boolean;
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
  pieces: string;
  piecesPerBag: number | null;
  quantityPerBag: number | null;
}

function emptyLine(branchProductId: string): PackLine {
  return {
    branchProductId,
    quantity: '',
    pieces: '',
    piecesPerBag: null,
    quantityPerBag: null,
  };
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
  initialItems?: Array<{ branchProductId: string; quantity: number; pieces?: number }>;
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
  const [templates, setTemplates] = useState<ClearancePackTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [title, setTitle] = useState(CLEARANCE_PACK_DEFAULT_TITLE);
  const [lines, setLines] = useState<PackLine[]>([]);
  const [pickerId, setPickerId] = useState('');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [bagCount, setBagCount] = useState('3');
  const [price, setPrice] = useState('50');
  const [notifyNeighbors, setNotifyNeighbors] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const productById = useMemo(
    () => new Map(ingredients.map((product) => [product.id, product])),
    [ingredients],
  );

  const catalog = useMemo(
    () =>
      ingredients.map((product) => ({
        branchProductId: product.id,
        productId: product.product.id,
        unit: product.product.unit,
        weighAtFulfillment: Boolean(product.product.weigh_at_fulfillment),
      })),
    [ingredients],
  );

  function applyTemplate(template: ClearancePackTemplate, bags = template.defaultBagCount) {
    const bagText = String(Math.max(1, Math.round(Number(bags) || 0)));
    setSelectedTemplateId(template.id);
    setTitle(template.title);
    setPrice(String(template.defaultPrice));
    setBagCount(bagText);
    const next = preloadPackTemplate({
      items: template.items,
      catalog,
      bagCount: Number(bagText),
    });
    setLines(
      next.map((line) => ({
        branchProductId: line.branchProductId,
        quantity: line.quantity > 0 ? decimalFromNumber(line.quantity, false) : '',
        pieces: line.pieces && line.pieces > 0 ? decimalFromNumber(line.pieces, false) : '',
        piecesPerBag: line.piecesPerBag,
        quantityPerBag: line.quantityPerBag,
      })),
    );
    setFocusedId(next.find((line) => line.quantity === 0)?.branchProductId ?? next[0]?.branchProductId ?? null);
    setError(null);
  }

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);
    setPickerId('');
    setSelectedTemplateId(null);
    setTitle(CLEARANCE_PACK_DEFAULT_TITLE);
    setBagCount('3');
    setPrice('50');

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/clearance-pack-templates');
        const payload = (await response.json()) as {
          templates?: ClearancePackTemplate[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? 'No se pudieron cargar los paquetes');
        if (cancelled) return;
        const nextTemplates = payload.templates ?? [];
        setTemplates(nextTemplates);

        if (initialItems.length) {
          setLines(
            initialItems.map((item) => ({
              branchProductId: item.branchProductId,
              quantity: decimalFromNumber(item.quantity, false),
              pieces: item.pieces && item.pieces > 0 ? decimalFromNumber(item.pieces, false) : '',
              piecesPerBag: null,
              quantityPerBag: null,
            })),
          );
          setFocusedId(initialItems[0]?.branchProductId ?? null);
          return;
        }

        if (nextTemplates[0]) {
          applyTemplate(nextTemplates[0]);
          return;
        }

        setLines([]);
        setFocusedId(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'No se pudieron cargar los paquetes');
        if (initialItems.length) {
          setLines(
            initialItems.map((item) => ({
              branchProductId: item.branchProductId,
              quantity: decimalFromNumber(item.quantity, false),
              pieces: '',
              piecesPerBag: null,
              quantityPerBag: null,
            })),
          );
          setFocusedId(initialItems[0]?.branchProductId ?? null);
        } else {
          setLines([]);
          setFocusedId(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // Reset only when the dialog opens; catalog/templates load in this session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function addPicked(id: string) {
    if (!id) return;
    setPickerId('');
    setLines((current) => {
      if (current.some((line) => line.branchProductId === id)) return current;
      return [...current, emptyLine(id)];
    });
    setFocusedId(id);
  }

  function bagsFromInput(value = bagCount) {
    return Math.max(1, Math.round(parseDecimal(value)) || 0) || 1;
  }

  function updateBagCount(next: string) {
    const bags = bagsFromInput(next);
    setBagCount(next);
    setLines((current) =>
      current.map((line) => {
        const product = productById.get(line.branchProductId);
        const weigh = isWeighProduce({
          unit: product?.product.unit,
          weighAtFulfillment: product?.product.weigh_at_fulfillment,
        });
        if (weigh && line.piecesPerBag && line.piecesPerBag > 0) {
          return {
            ...line,
            pieces: decimalFromNumber(totalFromPerBag(line.piecesPerBag, bags), false),
          };
        }
        if (!weigh && line.quantityPerBag && line.quantityPerBag > 0) {
          return {
            ...line,
            quantity: decimalFromNumber(totalFromPerBag(line.quantityPerBag, bags), false),
          };
        }
        return line;
      }),
    );
  }

  function updateQuantity(branchProductId: string, quantity: string) {
    const bags = bagsFromInput();
    setLines((current) =>
      current.map((line) => {
        if (line.branchProductId !== branchProductId) return line;
        const product = productById.get(line.branchProductId);
        const weigh = isWeighProduce({
          unit: product?.product.unit,
          weighAtFulfillment: product?.product.weigh_at_fulfillment,
        });
        const total = parseDecimal(quantity);
        return {
          ...line,
          quantity,
          quantityPerBag: weigh || !(total > 0) ? line.quantityPerBag : perBagFromTotal(total, bags),
        };
      }),
    );
  }

  function updatePieces(branchProductId: string, pieces: string) {
    const bags = bagsFromInput();
    setLines((current) =>
      current.map((line) => {
        if (line.branchProductId !== branchProductId) return line;
        const total = parseDecimal(pieces);
        return {
          ...line,
          pieces,
          piecesPerBag: total > 0 ? perBagFromTotal(total, bags) : null,
        };
      }),
    );
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const bags = Math.round(parseDecimal(bagCount));
      for (const line of lines) {
        const product = productById.get(line.branchProductId);
        if (!product) continue;
        const weigh = isWeighProduce({
          unit: product.product.unit,
          weighAtFulfillment: product.product.weigh_at_fulfillment,
        });
        if (weigh && !(parseDecimal(line.pieces) > 0)) {
          throw new Error(`Indica las piezas de ${product.product.name}.`);
        }
        if (!(parseDecimal(line.quantity) > 0)) {
          throw new Error(`Pesa ${product.product.name}.`);
        }
      }

      const response = await fetch('/api/clearance-packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || CLEARANCE_PACK_DEFAULT_TITLE,
          price: parseDecimal(price),
          bagCount: bags,
          notifyNeighbors,
          templateId: selectedTemplateId,
          saveTemplate: true,
          items: lines
            .map((line) => {
              const product = productById.get(line.branchProductId);
              const weigh = isWeighProduce({
                unit: product?.product.unit,
                weighAtFulfillment: product?.product.weigh_at_fulfillment,
              });
              return {
                branchProductId: line.branchProductId,
                quantity: parseDecimal(line.quantity),
                pieces: weigh ? parseDecimal(line.pieces) : null,
              };
            })
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
              Elige un paquete guardado. Solo pesas el total; las piezas ya vienen en la receta.
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

        {templates.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {templates.map((template) => (
              <ActionChip
                key={template.id}
                tone={selectedTemplateId === template.id ? 'amber' : 'slate'}
                onClick={() => applyTemplate(template)}
              >
                {template.title}
              </ActionChip>
            ))}
            <ActionChip
              tone={selectedTemplateId ? 'slate' : 'amber'}
              onClick={() => {
                setSelectedTemplateId(null);
                setTitle(CLEARANCE_PACK_DEFAULT_TITLE);
                setLines([]);
                setFocusedId(null);
              }}
            >
              Nuevo
            </ActionChip>
          </div>
        ) : null}

        <label className="mt-4 block text-sm">
          <span className="font-medium text-slate-700">Nombre del paquete</span>
          <input
            className="pv-input mt-1 w-full"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={CLEARANCE_PACK_DEFAULT_TITLE}
          />
        </label>

        {usbScaleEnabled ? (
          <div className="mt-3">
            <ScalePanel
              onWeight={(kg) => {
                if (!focusedId) return;
                updateQuantity(focusedId, String(Number(kg.toFixed(3))));
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
              const weigh = isWeighProduce({
                unit: product.product.unit,
                weighAtFulfillment: product.product.weigh_at_fulfillment,
              });
              const focused = focusedId === line.branchProductId;
              const pieceStock = Number(product.piece_stock ?? 0);
              return (
                <li
                  key={line.branchProductId}
                  className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 ${
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
                      {weigh && pieceStock > 0
                        ? `Hay ${formatDecimal(pieceStock)} pza · ${formatDecimal(Number(product.stock))} kg`
                        : `Hay ${formatDecimal(Number(product.stock))} ${unit}`}
                      {weigh ? ' · pesa el total' : ''}
                    </p>
                  </button>
                  {weigh ? (
                    <label className="flex shrink-0 items-center gap-1 text-sm">
                      <DecimalInput
                        className="pv-input w-16! px-1.5! py-1.5 text-center"
                        value={line.pieces}
                        integer
                        onChange={(value) => updatePieces(line.branchProductId, value)}
                        onFocus={() => setFocusedId(line.branchProductId)}
                        placeholder="0"
                      />
                      <span className="text-xs text-slate-500">pza</span>
                    </label>
                  ) : null}
                  <label className="flex shrink-0 items-center gap-1 text-sm">
                    <DecimalInput
                      className="pv-input w-20! px-1.5! py-1.5 text-center"
                      value={line.quantity}
                      onChange={(value) => updateQuantity(line.branchProductId, value)}
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
            <DecimalInput className="pv-input mt-1" value={bagCount} onChange={updateBagCount} />
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
