import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export async function GET() {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'profit.view',
    'No tienes permiso para ver utilidades',
  );
  if (denied) return denied;

  try {
    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();

    const { data: margins, error } = await supabase.rpc('get_product_margins', {
      p_branch_id: tenant.branchId,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ margins: margins ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar márgenes' },
      { status: 500 },
    );
  }
}
