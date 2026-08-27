import { redirect } from 'next/navigation';

import { createAdminClient } from '@puertaverde/supabase/admin';
import type { ProductUnit } from '@puertaverde/shared';

import { AdminShell } from '@/components/AdminShell';
import { PurchasesManager } from '@/components/PurchasesManager';
import { getStaffSession, loadPermissionMatrix, staffHasPermission } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; tab?: string }>;
}) {
  const staff = await getStaffSession();
  if (!staff) redirect('/login');

  const params = await searchParams;
  if (params.section === 'reposicion' || params.tab === 'reposicion') {
    redirect('/?section=stock');
  }

  const tenant = await getDefaultTenant();
  const permissionMatrix = await loadPermissionMatrix(staff.organizationId);
  const canManagePurchases = staffHasPermission(staff, 'purchases.manage', permissionMatrix);
  const supabase = createAdminClient();

  const [{ data: purchases }, { data: purchaseProducts }, { data: suppliers }, { data: expenses }] =
    await Promise.all([
      supabase
        .from('purchases')
        .select(`
          id,
          purchased_at,
          notes,
          total_amount,
          created_at,
          supplier:suppliers ( id, name ),
          items:purchase_items (
            id,
            quantity,
            unit_price,
            line_total,
            quality,
            branch_product:branch_products (
              id,
              product:products ( name, unit )
            )
          )
        `)
        .eq('branch_id', tenant.branchId)
        .order('purchased_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('branch_products')
        .select(
          'id, stock, price, avg_unit_cost, last_unit_cost, min_stock, product:products ( id, name, unit, sku )',
        )
        .eq('branch_id', tenant.branchId)
        .order('created_at', { ascending: true }),
      supabase
        .from('suppliers')
        .select('id, name, phone, notes, is_active, created_at')
        .eq('organization_id', tenant.organizationId)
        .order('name', { ascending: true }),
      supabase
        .from('expenses')
        .select('id, concept, amount, expense_date, notes, created_at')
        .eq('branch_id', tenant.branchId)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(500),
    ]);

  return (
    <AdminShell title="Inventario" subtitle={`Compras · ${tenant.branchName}`}>
      <PurchasesManager
        canManage={canManagePurchases}
        initialPurchases={(purchases ?? []) as Array<{
          id: string;
          purchased_at: string;
          notes: string | null;
          total_amount: number;
          created_at: string;
          supplier: { id: string; name: string } | null;
          items: Array<{
            id: string;
            quantity: number;
            unit_price: number;
            line_total: number;
            quality: 'premium' | 'normal' | 'saldo';
            branch_product: {
              id: string;
              product: { name: string; unit: ProductUnit } | null;
            } | null;
          }>;
        }>}
        initialProducts={(purchaseProducts ?? []) as Array<{
          id: string;
          stock: number;
          min_stock?: number | null;
          price?: number;
          avg_unit_cost?: number;
          last_unit_cost?: number | null;
          product: { id: string; name: string; unit: ProductUnit; sku?: string | null };
        }>}
        initialSuppliers={(suppliers ?? []) as Array<{
          id: string;
          name: string;
          phone: string | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
        }>}
        initialExpenses={(expenses ?? []) as Array<{
          id: string;
          concept: string;
          amount: number;
          expense_date: string;
          notes: string | null;
          created_at: string;
        }>}
      />
    </AdminShell>
  );
}
