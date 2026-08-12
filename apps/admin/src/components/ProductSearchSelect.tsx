'use client';

import { useMemo, useState } from 'react';

import { PRODUCT_UNIT_LABELS, formatMoney, type ProductUnit } from '@puertaverde/shared';

export interface SearchableProduct {
  id: string;
  price?: number;
  stock?: number;
  product: { name: string; unit: ProductUnit; sku?: string | null };
}

export function ProductSearchSelect({
  products,
  value,
  onChange,
  placeholder = 'Buscar producto…',
}: {
  products: SearchableProduct[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const selected = products.find((product) => product.id === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 12);
    return products
      .filter(
        (product) =>
          product.product.name.toLowerCase().includes(q) ||
          (product.product.sku ?? '').toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [products, query]);

  return (
    <div className="relative">
      <input
        className="pv-input mt-1"
        placeholder={placeholder}
        value={open ? query : selected?.product.name ?? ''}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!e.target.value) onChange('');
        }}
        onFocus={() => {
          setQuery(selected?.product.name ?? '');
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {filtered.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-emerald-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(product.id);
                  setQuery(product.product.name);
                  setOpen(false);
                }}
              >
                <span>{product.product.name}</span>
                <span className="text-xs text-slate-500">
                  {product.price != null ? `${formatMoney(Number(product.price))}/` : ''}
                  {PRODUCT_UNIT_LABELS[product.product.unit]}
                  {product.stock != null ? ` · ${Number(product.stock)}` : ''}
                </span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-500">Sin coincidencias</li>
          )}
        </ul>
      )}
    </div>
  );
}
