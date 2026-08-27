'use client';

import type { InputHTMLAttributes } from 'react';

const DECIMAL_PATTERN = /^-?\d*\.?\d*$/;

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'inputMode'> & {
  value: string;
  onChange: (value: string) => void;
};

/** Text input for amounts/qty — avoids sticky leading zeros from controlled type=number. */
export function DecimalInput({ value, onChange, className, ...rest }: Props) {
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={className}
      {...rest}
      value={value}
      onChange={(e) => {
        const raw = e.target.value.replace(',', '.');
        if (raw === '' || DECIMAL_PATTERN.test(raw)) {
          onChange(raw);
        }
      }}
    />
  );
}

export function parseDecimal(value: string, fallback = 0): number {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '-' || trimmed === '.' || trimmed === '-.') return fallback;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : fallback;
}

export function parseOptionalDecimal(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '-' || trimmed === '.' || trimmed === '-.') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function decimalFromNumber(value: number | null | undefined, blankZero = true): string {
  if (value == null || Number.isNaN(value)) return '';
  if (blankZero && value === 0) return '';
  return String(value);
}
