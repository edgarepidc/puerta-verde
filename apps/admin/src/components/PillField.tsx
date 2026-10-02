import type { ReactNode } from 'react';

export const PILL_INPUT_CLASS =
  'min-w-0 flex-1 bg-transparent text-sm font-medium text-emerald-900 outline-none placeholder:text-emerald-800/40 disabled:cursor-not-allowed';

export function PillField({
  label,
  icon,
  className = '',
  disabled = false,
  children,
}: {
  label: string;
  icon: ReactNode;
  className?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="font-medium text-slate-700">{label}</span>
      <div
        className={`mt-1 inline-flex w-full items-center gap-2 rounded-full border border-emerald-200 bg-white py-1 pl-1 pr-3 shadow-[0_2px_10px_rgba(16,185,129,0.28)] focus-within:bg-emerald-50 ${
          disabled ? 'opacity-60' : ''
        }`}
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800"
          aria-hidden
        >
          {icon}
        </span>
        {children}
      </div>
    </label>
  );
}
