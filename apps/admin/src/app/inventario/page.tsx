import { AdminShell } from '@/components/AdminShell';
import { InventoryManager } from '@/components/InventoryManager';
import { getDefaultTenant } from '@/lib/tenant';
import { createAdminClient } from '@puertaverde/supabase/admin';
import type { InventoryMovementType, ProductUnit } from '@puertaverde/shared';

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  const tenant = await getDefaultTenant();
  const supabase = createAdminClient();

  const [{ data: products }, { data: movements }] = await Promise.all([
    supabase
      .from('branch_products')
      .select(`
        id,
        stock,
        is_available,
        product:products ( id, name, unit )
      `)
      .eq('branch_id', tenant.branchId)
      .order('created_at', { ascending: true }),
    supabase
      .from('inventory_movements')
      .select(`
        id,
        movement_type,
        quantity,
        notes,
        expires_at,
        created_at,
        branch_product:branch_products (
          product:products ( name )
        )
      `)
      .eq('branch_id', tenant.branchId)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  return (
    <AdminShell title="Inventario" subtitle={`Stock, mermas y ajustes · ${tenant.branchName}`}>
      <p className="mb-6 rounded-2xl border border-slate-200/80 bg-white/60 px-4 py-3 text-sm text-slate-600">
        Aquí controlas cuánto hay en stock. Para registrar compras con proveedor y comparar precios,
        usa <a href="/compras" className="font-medium text-emerald-800 underline underline-offset-2">Compras</a>.
        Para trazabilidad por lote/PTI, usa{' '}
        <a href="/lotes" className="font-medium text-emerald-800 underline underline-offset-2">Lotes / PTI</a>.
      </p>
      <InventoryManager
        initialProducts={(products ?? []) as Array<{
          id: string;
          stock: number;
          is_available: boolean;
          product: { id: string; name: string; unit: ProductUnit };
        }>}
        initialMovements={(movements ?? []) as Array<{
          id: string;
          movement_type: InventoryMovementType;
          quantity: number;
          notes: string | null;
          expires_at: string | null;
          created_at: string;
          branch_product: { product: { name: string } | null } | null;
        }>}
      />
    </AdminShell>
  );
}
