import { AdminShell } from '@/components/AdminShell';
import { PromotionsManager } from '@/components/PromotionsManager';
import { getDefaultTenant } from '@/lib/tenant';
import { createAdminClient } from '@puertaverde/supabase/admin';
import type { PromotionKind } from '@puertaverde/shared';

export const dynamic = 'force-dynamic';

export default async function PromotionsPage() {
  const tenant = await getDefaultTenant();
  const supabase = createAdminClient();

  const [{ data: promotions }, { data: products }, { data: categories }] = await Promise.all([
    supabase
      .from('promotions')
      .select('*')
      .eq('branch_id', tenant.branchId)
      .order('created_at', { ascending: false }),
    supabase
      .from('products')
      .select('id, name')
      .eq('organization_id', tenant.organizationId)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('product_categories')
      .select('id, name')
      .eq('organization_id', tenant.organizationId)
      .order('sort_order'),
  ]);

  return (
    <AdminShell title="Promociones" subtitle={`Avisos visibles en ${tenant.branchName}`}>
      <PromotionsManager
        initialPromotions={(promotions ?? []) as Array<{
          id: string;
          title: string;
          body: string | null;
          kind: PromotionKind;
          image_url: string | null;
          discount_percent: number | null;
          product_id: string | null;
          category_id: string | null;
          starts_at: string | null;
          ends_at: string | null;
          is_active: boolean;
          created_at: string;
        }>}
        products={products ?? []}
        categories={categories ?? []}
      />
    </AdminShell>
  );
}
