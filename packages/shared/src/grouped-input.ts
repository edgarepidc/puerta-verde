/** Group thousands with commas while keeping a trailing decimal point. */
export function formatGroupedNumber(raw: string): string {
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

export type GroupedCaret = {
  intDigits: number;
  afterDot: boolean;
  fracDigits: number;
};

export function groupedCaretFromDisplay(display: string, caret: number): GroupedCaret {
  const clamped = Math.max(0, Math.min(caret, display.length));
  const before = display.slice(0, clamped);
  const dot = before.indexOf('.');
  if (dot === -1) {
    return { intDigits: before.replace(/\D/g, '').length, afterDot: false, fracDigits: 0 };
  }
  return {
    intDigits: before.slice(0, dot).replace(/\D/g, '').length,
    afterDot: true,
    fracDigits: before.slice(dot + 1).replace(/\D/g, '').length,
  };
}

function caretAfterNthDigit(value: string, digitCount: number): number {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (/\d/.test(value[i] ?? '')) {
      seen += 1;
      if (seen === digitCount) return i + 1;
    }
  }
  return value.length;
}

/** Restore the caret after commas are inserted, including just after `.`. */
export function caretForGroupedDisplay(display: string, caret: GroupedCaret): number {
  const dot = display.indexOf('.');
  if (caret.afterDot && dot !== -1) {
    if (caret.fracDigits <= 0) return dot + 1;
    return dot + 1 + caretAfterNthDigit(display.slice(dot + 1), caret.fracDigits);
  }
  const intPart = dot === -1 ? display : display.slice(0, dot);
  if (caret.intDigits <= 0) return display.startsWith('-') ? 1 : 0;
  return caretAfterNthDigit(intPart, caret.intDigits);
}
