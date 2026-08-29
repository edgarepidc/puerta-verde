'use client';

import { useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Spacing / layout on the wrapper (e.g. `mt-1`, `min-w-0`). */
  wrapperClassName?: string;
};

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M2.1 12s3.4-7 9.9-7 9.9 7 9.9 7-3.4 7-9.9 7-9.9-7-9.9-7Z" />
      <circle cx="12" cy="12" r="3" />
      {crossed ? <path d="M4 4l16 16" /> : null}
    </svg>
  );
}

export function PasswordInput({ className = 'pv-input', wrapperClassName, disabled, ...rest }: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={wrapperClassName ? `relative ${wrapperClassName}` : 'relative'}>
      <input
        {...rest}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        className={className ? `${className} pr-11` : 'pr-11'}
      />
      <button
        type="button"
        disabled={disabled}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 transition hover:text-slate-800 disabled:pointer-events-none disabled:opacity-40"
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setVisible((open) => !open)}
      >
        <EyeIcon crossed={visible} />
      </button>
    </div>
  );
}
