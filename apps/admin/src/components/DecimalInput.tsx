'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';

import { DECIMAL_FIELD_PROPS, INTEGER_FIELD_PROPS, formatDecimal } from '@puertaverde/shared';

const DECIMAL_PATTERN = /^-?\d*\.?\d*$/;
const INTEGER_PATTERN = /^-?\d*$/;

const NUMPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'backspace'] as const;

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'inputMode'> & {
  value: string;
  onChange: (value: string) => void;
  /** Group thousands with commas while typing (money). */
  groupThousands?: boolean;
  /** Whole numbers only — uses the iPad/iPhone number pad (no decimal key). */
  integer?: boolean;
};

function formatGrouped(raw: string): string {
  if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return raw;
  const negative = raw.startsWith('-');
  const body = negative ? raw.slice(1) : raw;
  const dot = body.indexOf('.');
  const intPart = dot === -1 ? body : body.slice(0, dot);
  const decPart = dot === -1 ? null : body.slice(dot + 1);
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = negative ? '-' : '';
  return decPart == null ? `${sign}${grouped}` : `${sign}${grouped}.${decPart}`;
}

function digitsBeforeCaret(value: string, caret: number): number {
  return value.slice(0, caret).replace(/\D/g, '').length;
}

function caretFromDigitCount(value: string, digitCount: number): number {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (/\d/.test(value[i])) {
      seen += 1;
      if (seen === digitCount) return i + 1;
    }
  }
  return value.length;
}

function capFractionDigits(value: string, max = 3): string {
  const dot = value.indexOf('.');
  if (dot === -1) return value;
  return value.slice(0, dot + 1 + max);
}

function parseNumericText(value: string): number {
  const trimmed = value.trim().replace(/,/g, '');
  if (!trimmed || trimmed === '-' || trimmed === '.' || trimmed === '-.') return Number.NaN;
  return Number(trimmed);
}

function isIpadDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad/i.test(ua)) return true;
  return navigator.maxTouchPoints > 1 && /Mac/i.test(`${navigator.platform} ${ua}`);
}

function applyTypedValue(raw: string, integer: boolean): string | null {
  if (raw === '') return raw;
  if (integer) return INTEGER_PATTERN.test(raw) ? raw : null;
  if (!DECIMAL_PATTERN.test(raw)) return null;
  return capFractionDigits(raw);
}

/** Text input for amounts/qty — avoids sticky leading zeros from controlled type=number. */
export function DecimalInput({
  value,
  onChange,
  className,
  groupThousands = false,
  integer = false,
  onFocus,
  onBlur,
  onTouchStart,
  disabled,
  readOnly,
  ...rest
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const padId = useId();
  const [ipad, setIpad] = useState(false);
  const [padOpen, setPadOpen] = useState(false);
  const fieldProps = integer ? INTEGER_FIELD_PROPS : DECIMAL_FIELD_PROPS;
  const useVirtualPad = ipad && !disabled && !readOnly && !integer;

  useEffect(() => {
    setIpad(isIpadDevice());
  }, []);

  useEffect(() => {
    if (!padOpen) return;
    document.body.classList.add('pv-numpad-open');
    inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return () => document.body.classList.remove('pv-numpad-open');
  }, [padOpen]);

  const commitRaw = (raw: string) => {
    const next = applyTypedValue(raw, integer);
    if (next != null) onChange(next);
  };

  const pressPadKey = (key: (typeof NUMPAD_KEYS)[number]) => {
    const raw = value.replace(/,/g, '');
    if (key === 'backspace') {
      commitRaw(raw.slice(0, -1));
      return;
    }
    if (key === '.') {
      if (raw.includes('.')) return;
      commitRaw(`${raw}.`);
      return;
    }
    commitRaw(`${raw}${key}`);
  };

  const closePad = () => {
    setPadOpen(false);
    inputRef.current?.blur();
  };

  return (
    <>
      <input
        {...rest}
        {...fieldProps}
        ref={inputRef}
        inputMode={useVirtualPad ? 'none' : fieldProps.inputMode}
        autoComplete="off"
        disabled={disabled}
        readOnly={Boolean(readOnly) || useVirtualPad}
        className={[className, useVirtualPad ? 'read-only:bg-inherit read-only:opacity-100' : null]
          .filter(Boolean)
          .join(' ')}
        value={groupThousands ? formatGrouped(value) : value}
        aria-controls={useVirtualPad ? padId : undefined}
        onTouchStart={onTouchStart}
        onFocus={(e) => {
          if (useVirtualPad) setPadOpen(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          if (useVirtualPad) setPadOpen(false);
          onBlur?.(e);
        }}
        onChange={(e) => {
          const input = e.currentTarget;
          const caret = input.selectionStart ?? input.value.length;
          const digits = digitsBeforeCaret(input.value, caret);
          const raw = groupThousands ? input.value.replace(/,/g, '') : input.value.replace(',', '.');
          const nextRaw = applyTypedValue(raw, integer);
          if (nextRaw == null) return;
          onChange(nextRaw);
          if (groupThousands) {
            const next = formatGrouped(nextRaw);
            queueMicrotask(() => {
              const pos = caretFromDigitCount(next, digits);
              input.setSelectionRange(pos, pos);
            });
          }
        }}
      />
      {useVirtualPad && padOpen
        ? createPortal(
            <div
              id={padId}
              role="group"
              aria-label="Teclado numérico"
              className="fixed inset-x-0 bottom-0 z-[100] border-t border-slate-200 bg-slate-100/95 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur-md"
            >
              <div className="mx-auto flex max-w-md items-center justify-end px-3 pt-2">
                <button
                  type="button"
                  className="rounded-full bg-emerald-700 px-4 py-1.5 text-sm font-semibold text-white"
                  onMouseDown={(e) => e.preventDefault()}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={closePad}
                >
                  Listo
                </button>
              </div>
              <div className="mx-auto grid max-w-md grid-cols-3 gap-2 p-3 pt-2">
                {NUMPAD_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className="flex h-12 items-center justify-center rounded-xl bg-white text-xl font-semibold text-slate-800 shadow-sm active:bg-slate-200"
                    aria-label={key === 'backspace' ? 'Borrar' : key === '.' ? 'Punto decimal' : key}
                    onMouseDown={(e) => e.preventDefault()}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => pressPadKey(key)}
                  >
                    {key === 'backspace' ? '⌫' : key}
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function parseDecimal(value: string, fallback = 0): number {
  const n = parseNumericText(value);
  return Number.isFinite(n) ? n : fallback;
}

export function parseOptionalDecimal(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '');
  if (!trimmed || trimmed === '-' || trimmed === '.' || trimmed === '-.') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function decimalFromNumber(value: number | null | undefined, blankZero = true): string {
  if (value == null || Number.isNaN(value)) return '';
  if (blankZero && value === 0) return '';
  return formatDecimal(value);
}
