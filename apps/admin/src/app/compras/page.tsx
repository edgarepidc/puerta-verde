import { Suspense } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { PurchasesManager } from '@/components/PurchasesManager';
import { getDefaultTenant } from '@/lib/tenant';
import { createAdminClient } from '@puertaverde/supabase/admin';
import type { ProductUnit } from '@puertaverde/shared';

export const dynamic = 'force-dynamic';

export default async function ComprasPage() {
  const tenant = await getDefaultTenant();
  const supabase = createAdminClient();

  const [{ data: purchases }, { data: products }, { data: suppliers }] = await Promise.all([
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
          branch_product:branch_products (
            id,
            product:products ( name, unit )
          )
        )
      `)
      .eq('branch_id', tenant.branchId)
      .order('purchased_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(80),
    supabase
      .from('branch_products')
      .select('id, stock, min_stock, product:products ( id, name, unit, sku )')
      .eq('branch_id', tenant.branchId)
      .order('created_at', { ascending: true }),
    supabase
      .from('suppliers')
      .select('id, name, phone, notes, is_active, created_at')
      .eq('organization_id', tenant.organizationId)
      .order('name', { ascending: true }),
  ]);

  return (
    <AdminShell
      title="Compras"
      subtitle={`Proveedores y precios de materia prima · ${tenant.branchName}`}
    >
      <Suspense fallback={<p className="text-sm text-slate-500">Cargando compras…</p>}>
      <PurchasesManager
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
            branch_product: {
              id: string;
              product: { name: string; unit: ProductUnit } | null;
            } | null;
          }>;
        }>}
        initialProducts={(products ?? []) as Array<{
          id: string;
          stock: number;
          min_stock?: number | null;
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
      />
      </Suspense>
    </AdminShell>
  );
}
