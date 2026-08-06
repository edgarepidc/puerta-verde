import { createAdminClient } from '@puertaverde/supabase/admin';

import { AdminShell } from '@/components/AdminShell';
import { LotsManager } from '@/components/LotsManager';
import { getDefaultTenant } from '@/lib/tenant';
import type { ProductUnit } from '@puertaverde/shared';

export const dynamic = 'force-dynamic';

export default async function LotesPage() {
  const tenant = await getDefaultTenant();
  const supabase = createAdminClient();

  const [{ data: lots }, { data: products }] = await Promise.all([
    supabase
      .from('product_lots')
      .select(`
        id, lot_code, gtin, supplier_name, pack_date, expires_at,
        quantity_received, quantity_remaining, pti_label, created_at,
        branch_product:branch_products ( product:products ( name, unit ) )
      `)
      .eq('branch_id', tenant.branchId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('branch_products')
      .select('id, product:products ( name, unit )')
      .eq('branch_id', tenant.branchId)
      .eq('is_available', true),
  ]);

  const productOptions = (products ?? []).map((row) => ({
    id: row.id,
    name: row.product?.name ?? 'Producto',
    unit: (row.product?.unit ?? 'kg') as ProductUnit,
  }));

  return (
    <AdminShell title="Lotes y PTI" subtitle={`Trazabilidad · ${tenant.branchName}`}>
      <LotsManager initialLots={lots ?? []} products={productOptions} />
    </AdminShell>
  );
}
