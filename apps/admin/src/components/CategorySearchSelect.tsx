'use client';

import { useMemo, useState } from 'react';

export function CategorySearchSelect({
  categories,
  value,
  onChange,
  onCreate,
}: {
  categories: Array<{ id: string; name: string }>;
  value: string;
  onChange: (id: string) => void;
  onCreate?: (name: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const selected = categories.find((category) => category.id === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories.slice(0, 12);
    return categories.filter((category) => category.name.toLowerCase().includes(q)).slice(0, 12);
  }, [categories, query]);

  const trimmedQuery = query.trim();
  const exactMatch = categories.some(
    (category) => category.name.toLowerCase() === trimmedQuery.toLowerCase(),
  );
  const canCreate = Boolean(onCreate && trimmedQuery && !exactMatch);

  return (
    <div className="relative">
      <input
        className="pv-input mt-1"
        placeholder="Buscar o crear categoría…"
        value={open ? query : selected?.name ?? ''}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!e.target.value) onChange('');
        }}
        onFocus={() => {
          setQuery(selected?.name ?? '');
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {canCreate && (
            <li>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm font-medium text-emerald-800 hover:bg-emerald-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onCreate?.(trimmedQuery);
                  setOpen(false);
                }}
              >
                Crear «{trimmedQuery}»
              </button>
            </li>
          )}
          <li>
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange('');
                setQuery('');
                setOpen(false);
              }}
            >
              Sin categoría
            </button>
          </li>
          {filtered.map((category) => (
            <li key={category.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-emerald-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(category.id);
                  setQuery(category.name);
                  setOpen(false);
                }}
              >
                {category.name}
              </button>
            </li>
          ))}
          {filtered.length === 0 && !canCreate && (
            <li className="px-3 py-2 text-sm text-slate-500">Sin coincidencias</li>
          )}
        </ul>
      )}
    </div>
  );
}
