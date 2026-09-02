import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { resolveProfitDateRange } from '@/lib/mexico-date';
import { fetchPeriodProfitExtras } from '@/lib/profit-extras';
import { getDefaultTenant } from '@/lib/tenant';

export async function GET(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'profit.view',
    'No tienes permiso para ver utilidades',
  );
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const range = resolveProfitDateRange(searchParams.get('from'), searchParams.get('to'));
    if (!range.ok) {
      return NextResponse.json({ error: range.error }, { status: 400 });
    }

    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();
    const [{ data, error }, { data: purchaseRows, error: purchaseError }, extras] = await Promise.all([
      supabase.rpc('get_profit_summary', {
        p_branch_id: tenant.branchId,
        p_start: range.start,
        p_end: range.end,
      }),
      supabase
        .from('purchases')
        .select('total_amount')
        .eq('branch_id', tenant.branchId)
        .gte('purchased_at', range.start)
        .lte('purchased_at', range.end)
        .limit(2000),
      fetchPeriodProfitExtras(supabase, tenant.branchId, range.start, range.end),
    ]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (purchaseError) {
      return NextResponse.json({ error: purchaseError.message }, { status: 400 });
    }

    const purchasesTotal = (purchaseRows ?? []).reduce(
      (sum, row) => sum + Number(row.total_amount ?? 0),
      0,
    );

    return NextResponse.json({
      summary: data?.[0] ?? null,
      purchasesTotal: Number(purchasesTotal.toFixed(2)),
      wasteCost: extras.wasteCost,
      zeroCostSold: extras.zeroCostSold,
      unpaidRevenue: extras.unpaidRevenue,
      unpaidCount: extras.unpaidCount,
      collectedRevenue: extras.collectedRevenue,
      collectedCount: extras.collectedCount,
      periodLabel: range.label,
      from: range.start,
      to: range.end,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al calcular utilidad' },
      { status: 500 },
    );
  }
}
