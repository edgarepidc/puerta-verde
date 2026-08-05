import { AdminShell } from '@/components/AdminShell';
import { ProductsManager } from '@/components/ProductsManager';
import { getDefaultTenant } from '@/lib/tenant';
import { createAdminClient } from '@puertaverde/supabase/admin';
import type { ProductUnit } from '@puertaverde/shared';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const tenant = await getDefaultTenant();
  const supabase = createAdminClient();

  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase
      .from('branch_products')
      .select(`
        id,
        price,
        stock,
        is_available,
        product:products (
          id,
          name,
          description,
          unit,
          is_active,
          category_id,
          category:product_categories ( id, name )
        )
      `)
      .eq('branch_id', tenant.branchId)
      .order('created_at', { ascending: true }),
    supabase
      .from('product_categories')
      .select('id, name, sort_order')
      .eq('organization_id', tenant.organizationId)
      .order('sort_order'),
  ]);

  return (
    <AdminShell
      title="Catálogo"
      subtitle={`${tenant.organizationName} · ${tenant.branchName}`}
    >
      <ProductsManager
        initialProducts={(products ?? []) as Array<{
          id: string;
          price: number;
          stock: number;
          is_available: boolean;
          product: {
            id: string;
            name: string;
            description: string | null;
            unit: ProductUnit;
            is_active: boolean;
            category_id: string | null;
            category: { id: string; name: string } | null;
          };
        }>}
        initialCategories={categories ?? []}
        branchName={tenant.branchName}
      />
    </AdminShell>
  );
}
