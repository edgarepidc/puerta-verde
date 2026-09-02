'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { isLowStock, type ProductUnit } from '@puertaverde/shared';

interface LowStockProduct {
  id: string;
  stock: number;
  min_stock?: number | null;
  product: {
    name: string;
    unit?: ProductUnit;
    category?: { name?: string | null } | null;
  };
}

const AUTO_HIDE_MS = 10_000;

export function LowStockBanner({
  products,
  href = '/numeros',
  persist = false,
  linkLabel = 'Ver qué comprar',
}: {
  products: LowStockProduct[];
  href?: string;
  /** When true, banner stays until the user closes it (no auto-hide). */
  persist?: boolean;
  linkLabel?: string;
}) {
  const lowStock = useMemo(
    () =>
      products.filter((product) =>
        isLowStock({
          stock: Number(product.stock),
          unit: product.product.unit ?? 'kg',
          minStock: product.min_stock,
          name: product.product.name,
          categoryName: product.product.category?.name,
        }),
      ),
    [products],
  );

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (lowStock.length === 0) {
      setVisible(false);
      return;
    }
    setVisible(true);
    if (persist) return;
    const timer = window.setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [lowStock, persist]);

  if (!visible || lowStock.length === 0) return null;

  return (
    <section className="pv-callout--amber mb-6 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-amber-900">
            ⚠️ Stock bajo · {lowStock.length} producto{lowStock.length === 1 ? '' : 's'}
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            Ábrelos en Qué comprar para reponer.
          </p>
          <Link href={href} className="mt-2 inline-block text-sm font-medium text-amber-900 underline">
            {linkLabel}
          </Link>
        </div>
        <button
          type="button"
          className="shrink-0 text-xs font-medium text-amber-800/80 hover:text-amber-950"
          onClick={() => setVisible(false)}
        >
          Cerrar
        </button>
      </div>
    </section>
  );
}
