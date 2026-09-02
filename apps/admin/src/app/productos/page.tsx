import { AdminShell } from '@/components/AdminShell';
import { ProductsManager } from '@/components/ProductsManager';
import { getStaffSession, loadPermissionMatrix, staffHasPermission } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';
import { createAdminClient } from '@puertaverde/supabase/admin';
import type { ProductUnit } from '@puertaverde/shared';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const staff = await getStaffSession();
  if (!staff) redirect('/login');

  const tenant = await getDefaultTenant();
  const permissionMatrix = await loadPermissionMatrix(staff.organizationId);
  const canManage = staffHasPermission(staff, 'products.manage', permissionMatrix);
  const canAdjustInventory = staffHasPermission(staff, 'inventory.adjust', permissionMatrix);
  const canEditStockThresholds = staffHasPermission(staff, 'stock.thresholds', permissionMatrix);
  const supabase = createAdminClient();

  const [
    { data: productsWithWeigh, error: productsError },
    { data: categories },
    { data: movements },
    { data: forecast },
  ] =
    await Promise.all([
    supabase
      .from('branch_products')
      .select(`
        id,
        price,
        stock,
        min_stock,
        avg_unit_cost,
        last_unit_cost,
        is_available,
        product:products (
          id,
          name,
          description,
          unit,
          sku,
          image_url,
          is_active,
          shelf_life_days,
          weigh_at_fulfillment,
          category_id,
          category:product_categories ( id, name )
        )
      `)
      .eq('branch_id', tenant.branchId)
      .order('created_at', { ascending: true }),
    supabase
      .from('product_categories')
      .select('id, name, sort_order, low_stock_threshold')
      .eq('organization_id', tenant.organizationId)
      .order('sort_order')
      .order('name'),
    supabase
      .from('inventory_movements')
      .select(`
        id,
        movement_type,
        quantity,
        notes,
        created_at,
        branch_product:branch_products (
          product:products ( name )
        )
      `)
      .eq('branch_id', tenant.branchId)
      .in('movement_type', ['waste', 'adjustment'])
      .order('created_at', { ascending: false })
      .limit(80),
    supabase.rpc('get_restock_forecast', {
      p_branch_id: tenant.branchId,
      p_horizon_days: 7,
    }),
  ]);

  let products: unknown = productsWithWeigh;
  if (productsError && /weigh_at_fulfillment/i.test(productsError.message)) {
    const fallback = await supabase
      .from('branch_products')
      .select(`
        id,
        price,
        stock,
        min_stock,
        avg_unit_cost,
        last_unit_cost,
        is_available,
        product:products (
          id,
          name,
          description,
          unit,
          sku,
          image_url,
          is_active,
          shelf_life_days,
          category_id,
          category:product_categories ( id, name )
        )
      `)
      .eq('branch_id', tenant.branchId)
      .order('created_at', { ascending: true });
    products = fallback.data;
  }

  return (
    <AdminShell
      title="Productos"
      subtitle={`${tenant.organizationName} · ${tenant.branchName}`}
    >
      <ProductsManager
        canManage={canManage}
        canAdjustInventory={canAdjustInventory}
        initialProducts={(products ?? []) as Array<{
          id: string;
          price: number;
          stock: number;
          min_stock: number;
          avg_unit_cost: number;
          last_unit_cost: number | null;
          is_available: boolean;
          product: {
            id: string;
            name: string;
            description: string | null;
            unit: ProductUnit;
            sku: string | null;
            image_url: string | null;
            is_active: boolean;
            shelf_life_days: number | null;
            category_id: string | null;
            category: { id: string; name: string } | null;
          };
        }>}
        initialCategories={(categories ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          sort_order: row.sort_order,
        }))}
        initialThresholdCategories={(categories ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          sort_order: row.sort_order,
          low_stock_threshold: Number(row.low_stock_threshold ?? 3),
        }))}
        initialForecast={(forecast ?? []) as Array<{
          branch_product_id: string;
          product_name: string;
          unit: ProductUnit;
          current_stock: number;
          min_stock: number;
          avg_daily_sales: number;
          forecast_demand: number;
          suggested_reorder: number;
          days_until_stockout: number | null;
        }>}
        canEditStockThresholds={canEditStockThresholds}
        initialMovements={(movements ?? []) as Array<{
          id: string;
          movement_type: 'purchase' | 'sale' | 'waste' | 'adjustment';
          quantity: number;
          notes: string | null;
          created_at: string;
          branch_product: { product: { name: string } | null } | null;
        }>}
        branchName={tenant.branchName}
      />
    </AdminShell>
  );
}
