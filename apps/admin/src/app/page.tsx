import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { createAdminClient } from '@puertaverde/supabase/admin';
import { type ProductUnit } from '@puertaverde/shared';

import { AdminShell } from '@/components/AdminShell';
import { ForecastManager } from '@/components/ForecastManager';
import { LowStockThresholdsManager } from '@/components/LowStockThresholdsManager';
import { OrdersBoard } from '@/components/OrdersBoard';
import { VentasTabs } from '@/components/VentasTabs';
import { getStaffSession, loadPermissionMatrix, staffHasPermission } from '@/lib/auth';
import { parseBranchSettingsFlags } from '@/lib/branch-settings';
import { loadOrdersBoard } from '@/lib/orders-board';

export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  const staff = await getStaffSession();
  if (!staff) redirect('/login');

  const permissionMatrix = await loadPermissionMatrix(staff.organizationId);
  const canEditPosPrice = staffHasPermission(staff, 'pos.edit_price', permissionMatrix);
  const canExportSales = staffHasPermission(staff, 'sales.export', permissionMatrix);
  const canEditOrders = staffHasPermission(staff, 'orders.edit', permissionMatrix);
  const canDeleteOrders = staffHasPermission(staff, 'orders.delete', permissionMatrix);
  const canEditStockThresholds = staffHasPermission(staff, 'stock.thresholds', permissionMatrix);

  const branch = {
    name: staff.branchName,
    slug: staff.branchSlug,
  };

  const supabase = createAdminClient();
  const [
    { data: branchSettingsRow },
    productsQuery,
    { data: forecast },
    { data: stockProducts },
    { data: stockCategories },
  ] = await Promise.all([
    supabase.from('branches').select('settings').eq('id', staff.branchId).maybeSingle(),
    supabase
      .from('branch_products')
      .select(
        'id, price, stock, piece_stock, min_stock, product:products ( id, name, unit, sku, image_url, weigh_at_fulfillment )',
      )
      .eq('branch_id', staff.branchId)
      .eq('is_available', true)
      .order('created_at', { ascending: true }),
    supabase.rpc('get_restock_forecast', {
      p_branch_id: staff.branchId,
      p_horizon_days: 7,
    }),
    supabase
      .from('branch_products')
      .select(`
        id,
        stock,
        min_stock,
        is_available,
        product:products ( id, name, unit, sku )
      `)
      .eq('branch_id', staff.branchId)
      .order('created_at', { ascending: true }),
    supabase
      .from('product_categories')
      .select('id, name, sort_order, low_stock_threshold')
      .eq('organization_id', staff.organizationId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
  ]);

  const usbScaleEnabled = parseBranchSettingsFlags(branchSettingsRow?.settings).usbScaleEnabled;

  let products: unknown = productsQuery.data;
  if (productsQuery.error) {
    const msg = productsQuery.error.message;
    if (/piece_stock/i.test(msg)) {
      const fallback = await supabase
        .from('branch_products')
        .select(
          'id, price, stock, min_stock, product:products ( id, name, unit, sku, image_url, weigh_at_fulfillment )',
        )
        .eq('branch_id', staff.branchId)
        .eq('is_available', true)
        .order('created_at', { ascending: true });
      products = fallback.data;
    } else if (/weigh_at_fulfillment/i.test(msg)) {
      const fallback = await supabase
        .from('branch_products')
        .select('id, price, stock, min_stock, product:products ( id, name, unit, sku, image_url )')
        .eq('branch_id', staff.branchId)
        .eq('is_available', true)
        .order('created_at', { ascending: true });
      products = fallback.data;
    }
  }

  const ordersWithBranch = await loadOrdersBoard(staff.branchId, branch);

  return (
    <AdminShell title="Ventas" subtitle={`${staff.branchName} · Operación del día`}>
      <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
        <VentasTabs
          pedidos={
            <OrdersBoard
              initialOrders={ordersWithBranch}
              branchName={staff.branchName}
              canEditPosPrice={canEditPosPrice}
              usbScaleEnabled={usbScaleEnabled}
              canExportSales={canExportSales}
              canEditOrders={canEditOrders}
              canDeleteOrders={canDeleteOrders}
              products={(products ?? []) as Array<{
                id: string;
                price: number;
                stock: number;
                min_stock?: number | null;
                product: {
                  id: string;
                  name: string;
                  unit: ProductUnit;
                  sku?: string | null;
                  image_url?: string | null;
                  weigh_at_fulfillment?: boolean;
                };
              }>}
            />
          }
          stock={
            <div className="space-y-6">
              <ForecastManager
                stockProducts={(stockProducts ?? []) as Array<{
                  id: string;
                  stock: number;
                  min_stock?: number | null;
                  product: {
                    name: string;
                    unit?: ProductUnit;
                    category?: { name?: string | null } | null;
                  };
                }>}
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
              />
              <LowStockThresholdsManager
                canEdit={canEditStockThresholds}
                initialCategories={(stockCategories ?? []).map((row) => ({
                  id: row.id,
                  name: row.name,
                  sort_order: row.sort_order,
                  low_stock_threshold: Number(row.low_stock_threshold ?? 3),
                }))}
              />
            </div>
          }
        />
      </Suspense>
    </AdminShell>
  );
}
