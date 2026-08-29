import { NextResponse } from 'next/server';

import { DEMO_PRODUCT_NAMES } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export async function POST() {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();

    const { data: products } = await supabase
      .from('products')
      .select('id, name')
      .eq('organization_id', tenant.organizationId)
      .in('name', DEMO_PRODUCT_NAMES);

    const productIds = (products ?? []).map((product) => product.id);
    if (productIds.length) {
      await supabase
        .from('products')
        .update({ is_active: false })
        .in('id', productIds)
        .eq('organization_id', tenant.organizationId);

      await supabase
        .from('branch_products')
        .update({ is_available: false })
        .eq('branch_id', tenant.branchId)
        .in('product_id', productIds);
    }

    await supabase
      .from('promotions')
      .update({ is_active: false })
      .eq('branch_id', tenant.branchId)
      .ilike('title', '%aguacate%');

    return NextResponse.json({ ok: true, archived: productIds.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al archivar demo' },
      { status: 500 },
    );
  }
}
