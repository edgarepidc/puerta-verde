import {
  cashCloseValidationError,
  expectedCashOnHand,
  expectedCashOnHandForCount,
  formatMoney,
  type CashDrawerLine,
} from '@puertaverde/shared';

import { CashCloseExpected } from '@/components/CashCloseExpected';
import { DecimalInput } from '@/components/DecimalInput';
import { formatMexicoSpokenDay, formatMexicoWeekday } from '@/lib/mexico-date';

const formulaCard = 'flex min-w-[12rem] flex-1 items-center gap-2.5 pv-glass-card px-3 py-2.5';
const formulaLabel = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500';
const formulaValue = 'text-lg font-bold tabular-nums text-slate-900';
const formulaInput =
  'w-full bg-transparent text-lg font-bold tabular-nums text-slate-900 outline-none disabled:cursor-not-allowed';
const editableTotal =
  'w-full rounded-lg border border-emerald-200 bg-white px-2 py-0.5 text-lg font-bold tabular-nums text-slate-900 outline-none focus:border-[#15803d] disabled:cursor-not-allowed disabled:bg-slate-50';
const actionGlow = '!border-emerald-200 !shadow-[0_4px_16px_rgba(21,128,61,0.22)]';

const CARD_MARK = {
  blue: 'bg-sky-100',
  amber: 'bg-amber-100',
  green: 'bg-emerald-100',
  slate: 'bg-slate-100',
} as const;

function CardMark({ emoji, tone }: { emoji: string; tone: keyof typeof CARD_MARK }) {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${CARD_MARK[tone]}`}
      aria-hidden
    >
      {emoji}
    </span>
  );
}

export function resolveDrawerCount({
  openingFloat,
  cashSales,
  cashLines,
  countedCash,
  countEdited,
  locked = false,
}: {
  openingFloat: string;
  cashSales: number;
  cashLines: CashDrawerLine[];
  countedCash: string;
  countEdited: boolean;
  locked?: boolean;
}) {
  const floatNumber = openingFloat === '' ? 0 : Number(openingFloat);
  const expected = expectedCashOnHand(Number.isFinite(floatNumber) ? floatNumber : 0, cashSales, cashLines);
  return {
    expected,
    sales: cashSales,
    lines: cashLines,
    countValue: locked || countEdited ? countedCash : String(expected),
  };
}

export function CashCloseFormula({
  date,
  openingFloat,
  onOpeningFloat,
  cashSales,
  cashLines,
  countedCash,
  countEdited,
  onCountedCash,
  notes,
  onNotes,
  canEdit,
  saving,
  saveLabel,
  savingLabel,
  onSave,
  error,
  countInputId = 'drawer-count',
  locked = false,
}: {
  date: string;
  openingFloat: string;
  onOpeningFloat: (value: string) => void;
  cashSales: number;
  cashLines: CashDrawerLine[];
  countedCash: string;
  countEdited: boolean;
  onCountedCash: (value: string) => void;
  notes: string;
  onNotes: (value: string) => void;
  canEdit: boolean;
  saving: boolean;
  saveLabel: string;
  savingLabel: string;
  onSave: () => void;
  error: string | null;
  countInputId?: string;
  locked?: boolean;
}) {
  const drawer = resolveDrawerCount({
    openingFloat,
    cashSales,
    cashLines,
    countedCash,
    countEdited,
    locked,
  });
  const countedNumber = drawer.countValue === '' ? null : Number(drawer.countValue);
  const shownExpected = expectedCashOnHandForCount(
    openingFloat === '' ? 0 : Number(openingFloat),
    drawer.sales,
    drawer.lines,
    countedNumber,
  );
  const cashDiff =
    countedNumber == null || !Number.isFinite(countedNumber) ? null : countedNumber - shownExpected;
  const countMatches = cashDiff != null && Math.abs(cashDiff) < 0.009;
  const closeBlocked = Boolean(
    cashCloseValidationError({
      countedCash: drawer.countValue === '' ? '' : Number(drawer.countValue),
      openingFloat: openingFloat === '' ? '' : Number(openingFloat),
      cashSales: drawer.sales,
      notes,
      cashLines: drawer.lines,
    }),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-stretch gap-3">
        <div className={formulaCard}>
          <CardMark emoji="📅" tone="blue" />
          <div className="min-w-0 flex-1">
            <p className={formulaLabel}>Día</p>
            <p className={`${formulaValue} leading-snug`}>{formatMexicoSpokenDay(date)}</p>
            <p className="mt-0.5 text-xs text-slate-500">{formatMexicoWeekday(date)}</p>
          </div>
        </div>
        <div className={formulaCard}>
          <CardMark emoji="💵" tone="amber" />
          <div className="min-w-0 flex-1">
            <p className={formulaLabel}>Fondo inicial</p>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="text-lg font-bold text-slate-900">$</span>
              <DecimalInput
                className={formulaInput}
                value={openingFloat}
                onChange={onOpeningFloat}
                disabled={!canEdit}
                groupThousands
              />
            </div>
          </div>
        </div>
        <span className="self-center px-1 text-2xl font-medium text-slate-400" aria-hidden>
          +
        </span>
        <div className={formulaCard}>
          <CardMark emoji="🛒" tone="green" />
          <div className="min-w-0 flex-1">
            <p className={formulaLabel}>Venta en efectivo</p>
            <p className={formulaValue}>{formatMoney(drawer.sales)}</p>
          </div>
        </div>
        <span className="self-center px-1 text-2xl font-medium text-slate-400" aria-hidden>
          =
        </span>
        <div className={`${formulaCard} min-w-[18rem] flex-[1.35] ${canEdit ? actionGlow : ''}`}>
          <CardMark emoji="🧮" tone="slate" />
          <div className="min-w-0 flex-1">
            <label className={formulaLabel} htmlFor={countInputId}>
              Debería haber
            </label>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="text-lg font-bold text-slate-900">$</span>
              <DecimalInput
                id={countInputId}
                className={editableTotal}
                value={drawer.countValue}
                onChange={onCountedCash}
                disabled={!canEdit}
                groupThousands
              />
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <p className="text-xs text-slate-500">Esperado {formatMoney(shownExpected)}</p>
              {cashDiff == null ? (
                <p className="text-right text-xs text-slate-500">Cuenta el efectivo</p>
              ) : (
                <p
                  className={`text-right text-xs font-semibold ${countMatches || cashDiff > 0 ? 'text-emerald-800' : 'text-rose-700'}`}
                >
                  {countMatches ? 'Cuadra' : `Diferencia ${formatMoney(cashDiff)}`}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <CashCloseExpected
        openingFloat={openingFloat === '' ? 0 : Number(openingFloat)}
        cashSales={drawer.sales}
        cashLines={drawer.lines}
        countedCash={drawer.countValue === '' ? null : Number(drawer.countValue)}
        linesOnly
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-[16rem] flex-1">
          <span className="text-sm text-slate-600">Notas</span>
          <input
            type="text"
            className="pv-input mt-1 text-sm disabled:bg-slate-50"
            value={notes}
            disabled={!canEdit}
            onChange={(event) => onNotes(event.target.value)}
            placeholder="Si no cuadra, anota por qué"
          />
        </label>
        {canEdit ? (
          <button
            type="button"
            className="pv-btn-account px-5 py-2.5 text-sm"
            disabled={saving || closeBlocked}
            onClick={onSave}
          >
            {saving ? savingLabel : saveLabel}
          </button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
