const MEXICO_TZ = 'America/Mexico_City';
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar date in Mexico City as YYYY-MM-DD. */
export function todayMexicoYmd(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MEXICO_TZ }).format(date);
}

/** Day of month (1–31) in Mexico City. */
export function daysElapsedInMexicoMonth(date = new Date()): number {
  const day = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: MEXICO_TZ, day: 'numeric' }).format(date),
  );
  return Math.max(day, 1);
}

/** e.g. "Agosto 2026 · día 1–20" */
export function currentMexicoMonthLabel(date = new Date()): string {
  const { start, end } = currentMexicoMonthRange(date);
  return formatMexicoPeriodLabel(start, end);
}

function mexicoYmdParts(ymd: string): { year: number; month: number; day: number } {
  const [year, month, day] = ymd.split('-').map(Number);
  return { year, month, day };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Inclusive YYYY-MM-DD range for the current Mexico calendar month (day 1 → today). */
export function currentMexicoMonthRange(date = new Date()): { start: string; end: string } {
  const end = todayMexicoYmd(date);
  const { year, month } = mexicoYmdParts(end);
  return { start: `${year}-${pad2(month)}-01`, end };
}

/** Inclusive YYYY-MM-DD range for the previous full Mexico calendar month. */
export function previousMexicoMonthRange(date = new Date()): { start: string; end: string } {
  const today = todayMexicoYmd(date);
  const { year, month } = mexicoYmdParts(today);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const last = daysInMonth(prevYear, prevMonth);
  return {
    start: `${prevYear}-${pad2(prevMonth)}-01`,
    end: `${prevYear}-${pad2(prevMonth)}-${pad2(last)}`,
  };
}

/** Human label for an inclusive Mexico date range. */
export function formatMexicoPeriodLabel(start: string, end: string): string {
  const startDate = new Date(mexicoYmdAtNoonIso(start));
  const endDate = new Date(mexicoYmdAtNoonIso(end));
  const sameMonth =
    start.slice(0, 7) === end.slice(0, 7) &&
    mexicoYmdParts(start).day === 1 &&
    mexicoYmdParts(end).day === daysInMonth(mexicoYmdParts(end).year, mexicoYmdParts(end).month);

  if (sameMonth) {
    const month = new Intl.DateTimeFormat('es-MX', { month: 'long', timeZone: MEXICO_TZ }).format(startDate);
    const year = mexicoYmdParts(start).year;
    return `${month.charAt(0).toUpperCase() + month.slice(1)} ${year}`;
  }

  if (start.slice(0, 7) === end.slice(0, 7) && mexicoYmdParts(start).day === 1) {
    const month = new Intl.DateTimeFormat('es-MX', { month: 'long', timeZone: MEXICO_TZ }).format(startDate);
    const year = mexicoYmdParts(start).year;
    const day = mexicoYmdParts(end).day;
    return `${month.charAt(0).toUpperCase() + month.slice(1)} ${year} · día 1–${day}`;
  }

  const fmt = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: MEXICO_TZ,
  });
  return `${fmt.format(startDate)} – ${fmt.format(endDate)}`;
}

const MAX_PROFIT_RANGE_DAYS = 366;

/**
 * Resolve profit report bounds from query params.
 * Defaults to current Mexico month-to-date when dates are omitted.
 */
export function resolveProfitDateRange(
  from?: string | null,
  to?: string | null,
): { ok: true; start: string; end: string; label: string } | { ok: false; error: string } {
  const today = todayMexicoYmd();
  const defaults = currentMexicoMonthRange();
  const startRaw = (from ?? '').trim() || defaults.start;
  const endRaw = (to ?? '').trim() || defaults.end;

  if (!isValidYmd(startRaw) || !isValidYmd(endRaw)) {
    return { ok: false, error: 'Rango de fechas no válido' };
  }

  const start = startRaw <= endRaw ? startRaw : endRaw;
  const end = startRaw <= endRaw ? endRaw : startRaw;

  if (end > today) {
    return { ok: false, error: 'La fecha final no puede ser futura' };
  }

  const startMs = new Date(mexicoYmdAtNoonIso(start)).getTime();
  const endMs = new Date(mexicoYmdAtNoonIso(end)).getTime();
  const days = Math.floor((endMs - startMs) / 86_400_000) + 1;
  if (days > MAX_PROFIT_RANGE_DAYS) {
    return { ok: false, error: `El periodo máximo es ${MAX_PROFIT_RANGE_DAYS} días` };
  }

  return { ok: true, start, end, label: formatMexicoPeriodLabel(start, end) };
}

export function isValidYmd(value: string): boolean {
  if (!YMD_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return (
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === m - 1 &&
    probe.getUTCDate() === d
  );
}

/** Midday Mexico City (UTC−6, no DST) for a calendar day. Used for date-range math, not sale times. */
export function mexicoYmdAtNoonIso(ymd: string): string {
  return `${ymd}T12:00:00-06:00`;
}

/**
 * Instant on a Mexico City calendar day, using the local clock from `date`.
 * Mexico City is UTC−6 year-round (no DST).
 */
export function mexicoYmdAtClockIso(ymd: string, date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: MEXICO_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(date);
  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00';
  const hour = lookup('hour') === '24' ? '00' : lookup('hour');
  return `${ymd}T${hour}:${lookup('minute')}:${lookup('second')}-06:00`;
}

export function addMexicoDays(ymd: string, days: number): string {
  const probe = new Date(mexicoYmdAtNoonIso(ymd));
  probe.setDate(probe.getDate() + days);
  return todayMexicoYmd(probe);
}

/** Inclusive start / exclusive end instants for a Mexico City calendar day. */
export function mexicoYmdBoundsIso(ymd: string): { start: string; end: string } {
  return {
    start: `${ymd}T00:00:00-06:00`,
    end: `${addMexicoDays(ymd, 1)}T00:00:00-06:00`,
  };
}

/**
 * Validate a POS sale date: must be a real calendar day, not in the future
 * (Mexico City), and not older than `maxDaysBack` days.
 * `iso` uses the current Mexico City clock on that calendar day (not noon),
 * so live sales keep the real hour.
 */
export function parseSoldOnDate(
  soldOn: string | undefined | null,
  options?: { maxDaysBack?: number },
): { ok: true; ymd: string; iso: string } | { ok: false; error: string } {
  const maxDaysBack = options?.maxDaysBack ?? 90;
  const today = todayMexicoYmd();
  const ymd = (soldOn ?? today).trim();

  if (!isValidYmd(ymd)) {
    return { ok: false, error: 'Fecha de venta no válida' };
  }
  if (ymd > today) {
    return { ok: false, error: 'La fecha de venta no puede ser futura' };
  }

  const minDate = new Date(`${today}T12:00:00-06:00`);
  minDate.setDate(minDate.getDate() - maxDaysBack);
  const minYmd = todayMexicoYmd(minDate);
  if (ymd < minYmd) {
    return { ok: false, error: `Solo se permiten ventas de los últimos ${maxDaysBack} días` };
  }

  return { ok: true, ymd, iso: mexicoYmdAtClockIso(ymd) };
}
