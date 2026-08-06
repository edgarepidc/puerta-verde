import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export async function GET(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const { searchParams } = new URL(request.url);
    const days = Number(searchParams.get('days') ?? 30);

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc('get_profit_summary', {
      p_branch_id: tenant.branchId,
      p_days: days,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ summary: data?.[0] ?? null, days });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al calcular utilidad' },
      { status: 500 },
    );
  }
}
