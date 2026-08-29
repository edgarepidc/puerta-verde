'use client';

import type { ReactNode } from 'react';

export function WhatsAppGlyph({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export function ChevronDownIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`h-4 w-4 transition group-open:rotate-180 ${className}`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const TONES = {
  emerald: {
    chip: 'border-emerald-200 text-emerald-900 hover:bg-emerald-50',
    shadow: 'shadow-[0_4px_16px_rgba(16,185,129,0.32)]',
    icon: 'bg-emerald-100',
  },
  slate: {
    chip: 'border-slate-200 text-slate-800 hover:bg-slate-50',
    shadow: 'shadow-[0_3px_12px_rgba(15,23,42,0.12)]',
    icon: 'bg-slate-100',
  },
  rose: {
    chip: 'border-rose-200 text-rose-900 hover:bg-rose-50',
    shadow: 'shadow-[0_4px_18px_rgba(244,63,94,0.34)]',
    icon: 'bg-rose-100',
  },
  sky: {
    chip: 'border-sky-200 text-sky-900 hover:bg-sky-50',
    shadow: 'shadow-[0_4px_16px_rgba(14,165,233,0.30)]',
    icon: 'bg-sky-100',
  },
  whatsapp: {
    chip: 'border-[#25D366]/45 text-[#075E54] hover:bg-[#25D366]/10',
    shadow: 'shadow-[0_4px_16px_rgba(37,211,102,0.28)]',
    icon: 'bg-[#25D366] text-white',
  },
} as const;

const SIZES = {
  md: {
    chip: 'gap-2 py-1 pl-1 pr-3 text-sm',
    icon: 'h-7 w-7 text-base',
  },
  lg: {
    chip: 'gap-2.5 py-1.5 pl-1.5 pr-4 text-sm',
    icon: 'h-9 w-9 text-xl',
  },
} as const;

export function ActionChip({
  children,
  emoji,
  icon,
  tone = 'slate',
  size = 'md',
  elevated = true,
  as = 'button',
  className = '',
  disabled,
  onClick,
  type = 'button',
}: {
  children: ReactNode;
  emoji?: string;
  icon?: ReactNode;
  tone?: keyof typeof TONES;
  size?: keyof typeof SIZES;
  elevated?: boolean;
  as?: 'button' | 'span';
  className?: string;
  disabled?: boolean;
  onClick?: () => void | Promise<void>;
  type?: 'button' | 'submit';
}) {
  const toneCls = TONES[tone];
  const sizeCls = SIZES[size];
  const showIcon = icon != null || Boolean(emoji);
  const content = (
    <>
      {showIcon ? (
        <span
          className={`flex shrink-0 items-center justify-center rounded-full ${sizeCls.icon} ${toneCls.icon}`}
          aria-hidden
        >
          {icon ?? emoji}
        </span>
      ) : null}
      {children}
    </>
  );

  const chipClass = `inline-flex items-center rounded-full border bg-white font-medium transition disabled:opacity-60 disabled:hover:bg-white ${showIcon ? sizeCls.chip : 'px-3 py-1.5 text-sm'} ${toneCls.chip} ${elevated ? toneCls.shadow : ''} ${className}`;

  if (as === 'span') {
    return <span className={chipClass}>{content}</span>;
  }

  return (
    <button type={type} disabled={disabled} onClick={onClick} className={chipClass}>
      {content}
    </button>
  );
}

export function FoldableSummary({
  title,
  hint,
  emoji,
  iconClass,
  actions,
}: {
  title: string;
  hint: string;
  emoji: string;
  iconClass: string;
  actions?: ReactNode;
}) {
  return (
    <summary className="flex cursor-pointer list-none items-start justify-between gap-3 marker:content-none [&::-webkit-details-marker]:hidden">
      <div className="flex min-w-0 items-start gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl ${iconClass}`}
          aria-hidden
        >
          {emoji}
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-sm font-normal text-slate-500">{hint}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2">
        {actions ? (
          <div
            className="hidden flex-wrap items-center justify-end gap-2 group-open:flex"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            {actions}
          </div>
        ) : null}
        <ActionChip as="span" icon={<ChevronDownIcon />} className="shrink-0">
          <span className="group-open:hidden">Desplegar</span>
          <span className="hidden group-open:inline">Cerrar</span>
        </ActionChip>
      </div>
    </summary>
  );
}
