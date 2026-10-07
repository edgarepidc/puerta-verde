import { createServerClient } from '@puertaverde/supabase/client';

import { Storefront } from '@/components/Storefront';

type PublicClient = ReturnType<typeof createServerClient>;

export const dynamic = 'force-dynamic';

function missingStore() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h1 className="text-2xl font-bold">Tienda no encontrada</h1>
      <p className="mt-2 text-[var(--pv-green-800)]">Verifica el enlace o contacta a tu verdulería.</p>
    </main>
  );
}

async function loadCatalog(supabase: PublicClient, branchId: string) {
  const [{ data: branchProducts }, { data: promotions }, { data: buildings }] = await Promise.all([
    supabase
      .from('branch_products')
      .select('id, price, stock, min_stock, product:products(id, name, unit, image_url, category_id, is_active, weigh_at_fulfillment, pos_only, category:product_categories(name))')
      .eq('branch_id', branchId)
      .eq('is_available', true),
    supabase
      .from('promotions')
      .select('id, title, body, kind, image_url, discount_percent, product_id, category_id')
      .eq('branch_id', branchId)
      .eq('is_active', true),
    supabase
      .from('buildings')
      .select('id, name, units(id, identifier)')
      .eq('branch_id', branchId)
      .order('name'),
  ]);

  const visibleProducts = (branchProducts ?? []).filter((row) => {
    const product = row.product as { is_active?: boolean; pos_only?: boolean } | null;
    return product?.is_active !== false && product?.pos_only !== true;
  });

  return {
    products: visibleProducts as StorefrontProduct[],
    promotions: promotions ?? [],
    buildings: (buildings ?? []) as unknown as Array<{
      id: string;
      name: string;
      units: Array<{ id: string; identifier: string }>;
    }>,
  };
}

export default async function BranchStorePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createServerClient();

  const { data: branchRows } = await supabase.rpc('get_public_branch', { target_slug: slug });
  const branch = branchRows?.[0];

  if (branch) {
    const catalog = await loadCatalog(supabase, branch.id);
    return (
      <Storefront
        branch={branch}
        products={catalog.products}
        promotions={catalog.promotions}
        buildings={catalog.buildings}
      />
    );
  }

  const { data: mirrorRows } = await supabase.rpc('get_public_storefront', { target_slug: slug });
  const mirror = mirrorRows?.[0];
  if (!mirror) return missingStore();

  const catalog = await loadCatalog(supabase, mirror.branch_id);
  return (
    <Storefront
      branch={{
        id: mirror.branch_id,
        organization_id: mirror.organization_id,
        name: mirror.name,
        slug: mirror.branch_slug,
        pickup_instructions: mirror.pickup_instructions,
        delivery_fee: 0,
        minimum_order_amount: Number(mirror.minimum_order_amount),
        whatsapp_phone: mirror.whatsapp_phone,
        opening_hours: mirror.opening_hours,
        fulfillment_mode: 'delivery',
        org_name: mirror.org_name,
        markupPercent: Number(mirror.markup_percent),
        storefrontSlug: mirror.slug,
        shippingIncluded: true,
      }}
      products={catalog.products}
      promotions={catalog.promotions}
      buildings={[]}
    />
  );
}

export interface StorefrontProduct {
  id: string;
  price: number;
  stock: number;
  min_stock?: number | null;
  product: {
    id: string;
    name: string;
    unit: string;
    image_url: string | null;
    category_id: string | null;
    is_active?: boolean;
    weigh_at_fulfillment?: boolean;
    pos_only?: boolean;
    category: { name: string } | null;
  };
}
