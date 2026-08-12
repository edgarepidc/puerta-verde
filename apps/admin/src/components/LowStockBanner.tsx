import Link from 'next/link';

import { LOW_STOCK_THRESHOLD, PRODUCT_UNIT_LABELS, type ProductUnit } from '@puertaverde/shared';

interface LowStockProduct {
  id: string;
  stock: number;
  product: { name: string; unit?: ProductUnit };
}

export function LowStockBanner({
  products,
  href = '/compras',
}: {
  products: LowStockProduct[];
  href?: string;
}) {
  const lowStock = products.filter((product) => Number(product.stock) <= LOW_STOCK_THRESHOLD);
  if (lowStock.length === 0) return null;

  return (
    <section className="pv-callout--amber mb-6 rounded-2xl p-4">
      <h2 className="font-semibold text-amber-900">Stock bajo</h2>
      <p className="mt-1 text-sm text-amber-800">
        {lowStock
          .map((product) => {
            const unit = product.product.unit ? PRODUCT_UNIT_LABELS[product.product.unit] : '';
            return `${product.product.name} (${Number(product.stock)}${unit ? ` ${unit}` : ''})`;
          })
          .join(' · ')}
      </p>
      <Link href={href} className="mt-2 inline-block text-sm font-medium text-amber-900 underline">
        Ir a Compras
      </Link>
    </section>
  );
}
