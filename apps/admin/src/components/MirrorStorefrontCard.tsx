'use client';

import { useState } from 'react';

import { formatMoney, markedUpUnitPrice, normalizeStorefrontSlug } from '@puertaverde/shared';

import { ActionChip, FoldableSummary } from '@/components/ActionChip';
import { DecimalInput, decimalFromNumber, parseDecimal } from '@/components/DecimalInput';

export interface MirrorStorefront {
  id: string;
  name: string;
  slug: string;
  markup_percent: number;
  is_active: boolean;
}

export function MirrorStorefrontCard({
  initial,
  canManage,
}: {
  initial: MirrorStorefront | null;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [markupText, setMarkupText] = useState(decimalFromNumber(initial?.markup_percent ?? 0));
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [savedSlug, setSavedSlug] = useState(initial?.slug ?? '');
  const [savedActive, setSavedActive] = useState(initial?.is_active ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const markup = parseDecimal(markupText);
  const sample = markedUpUnitPrice(100, markup);
  const publicSlug = normalizeStorefrontSlug(savedSlug);
  const webUrl = process.env.NEXT_PUBLIC_WEB_URL ?? 'https://puerta-verde-web.vercel.app';
  const publicHref = publicSlug && savedActive ? `${webUrl}/${publicSlug}` : null;

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch('/api/storefronts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug,
          markupPercent: markup,
          isActive,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar');
      const next = result.storefront as MirrorStorefront;
      setName(next.name);
      setSlug(next.slug);
      setSavedSlug(next.slug);
      setSavedActive(next.is_active);
      setIsActive(next.is_active);
      setMarkupText(decimalFromNumber(Number(next.markup_percent)));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <details
      className="group pv-glass-card min-w-0 space-y-4 overflow-hidden p-4 sm:p-6"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <FoldableSummary
        title="Otra zona"
        hint="Misma mercancía. El porcentaje va incluido en el precio, sin cobro de envío."
        emoji="🚚"
        iconClass="bg-amber-100"
        actions={
          canManage ? (
            <ActionChip emoji="✅" disabled={saving} onClick={() => void save()}>
              {saving ? 'Guardando…' : 'Guardar zona'}
            </ActionChip>
          ) : undefined
        }
      />
      <div className="grid gap-4 md:grid-cols-4">
        <label className="block text-sm md:col-span-2">
          <span className="font-medium text-slate-700">Nombre</span>
          <input
            className="pv-input mt-1"
            value={name}
            disabled={!canManage}
            placeholder="Roma"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Liga</span>
          <input
            className="pv-input mt-1"
            value={slug}
            disabled={!canManage}
            placeholder="roma"
            onChange={(event) => setSlug(event.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Porcentaje sobre el precio</span>
          <DecimalInput
            placeholder="0"
            className="pv-input mt-1"
            value={markupText}
            disabled={!canManage}
            onChange={setMarkupText}
          />
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white/60 p-3 text-sm md:col-span-4">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={isActive}
            disabled={!canManage}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          <span>
            <span className="font-medium text-slate-800">Activa</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Un producto de {formatMoney(100)} se publica en {formatMoney(sample)}. El pedido entra
              a esta caja y baja el mismo stock.
            </span>
          </span>
        </label>
      </div>
      {publicHref ? (
        <p className="text-sm text-slate-600">
          Página pública:{' '}
          <a href={publicHref} className="font-medium text-emerald-800 underline" target="_blank" rel="noreferrer">
            {publicHref}
          </a>
        </p>
      ) : null}
      {saved ? <p className="text-sm text-emerald-700">Zona guardada.</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!canManage ? (
        <p className="text-sm text-slate-500">Solo lectura · no tienes permiso para editar la tienda.</p>
      ) : null}
    </details>
  );
}
