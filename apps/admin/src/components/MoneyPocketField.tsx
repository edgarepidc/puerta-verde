'use client';

import { MONEY_POCKET_LABELS, MONEY_POCKETS, type MoneyPocket } from '@puertaverde/shared';

export function MoneyPocketField({
  value,
  onChange,
  label = 'Pagó con',
  className = '',
}: {
  value: MoneyPocket;
  onChange: (value: MoneyPocket) => void;
  label?: string;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="font-medium text-slate-700">{label}</span>
      <select
        className="pv-input mt-1"
        value={value}
        onChange={(event) => onChange(event.target.value === 'account' ? 'account' : 'cash')}
      >
        {MONEY_POCKETS.map((pocket) => (
          <option key={pocket} value={pocket}>
            {MONEY_POCKET_LABELS[pocket]}
          </option>
        ))}
      </select>
    </label>
  );
}
