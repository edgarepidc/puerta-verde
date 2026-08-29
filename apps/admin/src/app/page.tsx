import { redirect } from 'next/navigation';

import { createAdminClient } from '@puertaverde/supabase/admin';
import { type ProductUnit } from '@puertaverde/shared';

import { AdminShell } from '@/components/AdminShell';
import { OrdersBoard } from '@/components/OrdersBoard';
import { getStaffSession, loadPermissionMatrix, staffHasPermission } from '@/lib/auth';
import { parseBranchSettingsFlags } from '@/lib/branch-settings';
import { loadOrdersBoard } from '@/lib/orders-board';

export const dynamic = 'force-dynamic';

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; tab?: string }>;
}) {
  const staff = await getStaffSession();
  if (!staff) redirect('/login');

  const params = await searchParams;
  if (
    params.section === 'stock' ||
    params.tab === 'stock' ||
    params.section === 'reposicion' ||
    params.tab === 'reposicion'
  ) {
    redirect('/numeros');
  }

  const permissionMatrix = await loadPermissionMatrix(staff.organizationId);
  const canEditPosPrice = staffHasPermission(staff, 'pos.edit_price', permissionMatrix);
  const canExportSales = staffHasPermission(staff, 'sales.export', permissionMatrix);
  const canEditOrders = staffHasPermission(staff, 'orders.edit', permissionMatrix);
  const canDeleteOrders = staffHasPermission(staff, 'orders.delete', permissionMatrix);

  const branch = {
    name: staff.branchName,
    slug: staff.branchSlug,
  };

  const supabase = createAdminClient();
  const [{ data: branchSettingsRow }, productsQuery] = await Promise.all([
    supabase.from('branches').select('settings').eq('id', staff.branchId).maybeSingle(),
    supabase
      .from('branch_products')
      .select(
        'id, price, stock, piece_stock, min_stock, product:products ( id, name, unit, sku, image_url, weigh_at_fulfillment )',
      )
      .eq('branch_id', staff.branchId)
      .eq('is_available', true)
      .order('created_at', { ascending: true }),
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
    </AdminShell>
  );
}
