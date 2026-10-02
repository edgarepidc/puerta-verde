import type { ReactNode } from 'react';

const PILL_TONES = {
  emerald: {
    wrap: 'border-emerald-200 shadow-[0_2px_10px_rgba(16,185,129,0.28)] focus-within:bg-emerald-50',
    icon: 'bg-emerald-100 text-emerald-800',
    input: 'text-emerald-900 placeholder:text-emerald-800/40',
  },
  slate: {
    wrap: 'border-slate-200 shadow-[0_3px_12px_rgba(15,23,42,0.12)] focus-within:bg-slate-50',
    icon: 'bg-slate-100 text-slate-700',
    input: 'text-slate-800 placeholder:text-slate-400',
  },
  sky: {
    wrap: 'border-sky-200 shadow-[0_4px_16px_rgba(14,165,233,0.30)] focus-within:bg-sky-50',
    icon: 'bg-sky-100 text-sky-800',
    input: 'text-sky-900 placeholder:text-sky-800/40',
  },
  amber: {
    wrap: 'border-amber-300 shadow-[0_4px_16px_rgba(245,158,11,0.30)] focus-within:bg-amber-50',
    icon: 'bg-amber-100 text-amber-800',
    input: 'text-amber-900 placeholder:text-amber-800/40',
  },
  rose: {
    wrap: 'border-rose-200 shadow-[0_4px_18px_rgba(244,63,94,0.34)] focus-within:bg-rose-50',
    icon: 'bg-rose-100 text-rose-800',
    input: 'text-rose-900 placeholder:text-rose-800/40',
  },
} as const;

export type PillTone = keyof typeof PILL_TONES;

export function pillInputClass(tone: PillTone = 'slate') {
  return `min-w-0 flex-1 bg-transparent text-sm font-medium outline-none disabled:cursor-not-allowed ${PILL_TONES[tone].input}`;
}

export function PillField({
  label,
  icon,
  tone = 'slate',
  className = '',
  disabled = false,
  children,
}: {
  label: string;
  icon: ReactNode;
  tone?: PillTone;
  className?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const toneCls = PILL_TONES[tone];
  return (
    <label className={`block text-sm ${className}`}>
      <span className="font-medium text-slate-700">{label}</span>
      <div
        className={`mt-1 inline-flex w-full items-center gap-2 rounded-full border bg-white py-1 pl-1 pr-3 ${toneCls.wrap} ${
          disabled ? 'opacity-60' : ''
        }`}
      >
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${toneCls.icon}`}
          aria-hidden
        >
          {icon}
        </span>
        {children}
      </div>
    </label>
  );
}
