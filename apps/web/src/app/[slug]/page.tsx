import { createServerClient } from '@puertaverde/supabase/client';

import { Storefront } from '@/components/Storefront';

export const dynamic = 'force-dynamic';

export default async function BranchStorePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createServerClient();

  const { data: branchRows } = await supabase.rpc('get_public_branch', { target_slug: slug });
  const branch = branchRows?.[0];

  if (!branch) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-2xl font-bold">Tienda no encontrada</h1>
        <p className="mt-2 text-[var(--pv-green-800)]">Verifica el enlace o contacta a tu verdulería.</p>
      </main>
    );
  }

  const [{ data: branchProducts }, { data: promotions }, { data: buildings }] = await Promise.all([
    supabase
      .from('branch_products')
      .select('id, price, stock, product:products(id, name, unit, image_url, category_id, is_active, category:product_categories(name))')
      .eq('branch_id', branch.id)
      .eq('is_available', true),
    supabase
      .from('promotions')
      .select('id, title, body, kind, image_url, discount_percent, product_id, category_id')
      .eq('branch_id', branch.id)
      .eq('is_active', true),
    supabase
      .from('buildings')
      .select('id, name, units(id, identifier)')
      .eq('branch_id', branch.id)
      .order('name'),
  ]);

  const visibleProducts = (branchProducts ?? []).filter(
    (row) => (row.product as { is_active?: boolean } | null)?.is_active !== false,
  );

  return (
    <Storefront
      branch={branch}
      products={visibleProducts as StorefrontProduct[]}
      promotions={promotions ?? []}
      buildings={
        (buildings ?? []) as unknown as Array<{
          id: string;
          name: string;
          units: Array<{ id: string; identifier: string }>;
        }>
      }
    />
  );
}

export interface StorefrontProduct {
  id: string;
  price: number;
  stock: number;
  product: {
    id: string;
    name: string;
    unit: string;
    image_url: string | null;
    category_id: string | null;
    is_active?: boolean;
    category: { name: string } | null;
  };
}
