'use client';

import type { InputHTMLAttributes } from 'react';

import { formatDecimal } from '@puertaverde/shared';

const DECIMAL_PATTERN = /^-?\d*\.?\d*$/;

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'inputMode'> & {
  value: string;
  onChange: (value: string) => void;
  /** Group thousands with commas while typing (money). */
  groupThousands?: boolean;
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

function capFractionDigits(value: string, max = 2): string {
  const dot = value.indexOf('.');
  if (dot === -1) return value;
  return value.slice(0, dot + 1 + max);
}

function parseNumericText(value: string): number {
  const trimmed = value.trim().replace(/,/g, '');
  if (!trimmed || trimmed === '-' || trimmed === '.' || trimmed === '-.') return Number.NaN;
  return Number(trimmed);
}

/** Text input for amounts/qty — avoids sticky leading zeros from controlled type=number. */
export function DecimalInput({ value, onChange, className, groupThousands = false, ...rest }: Props) {
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={className}
      {...rest}
      value={groupThousands ? formatGrouped(value) : value}
      onChange={(e) => {
        const input = e.currentTarget;
        const caret = input.selectionStart ?? input.value.length;
        const digits = digitsBeforeCaret(input.value, caret);
        const raw = groupThousands ? input.value.replace(/,/g, '') : input.value.replace(',', '.');
        if (raw === '' || DECIMAL_PATTERN.test(raw)) {
          const nextRaw = capFractionDigits(raw);
          onChange(nextRaw);
          if (groupThousands) {
            const next = formatGrouped(nextRaw);
            queueMicrotask(() => {
              const pos = caretFromDigitCount(next, digits);
              input.setSelectionRange(pos, pos);
            });
          }
        }
      }}
    />
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
