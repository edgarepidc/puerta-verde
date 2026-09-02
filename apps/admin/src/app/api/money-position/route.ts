import { NextResponse } from 'next/server';

import { validateMoneyPositionInput } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { fetchMoneyPosition } from '@/lib/money-position';
import { resolveProfitDateRange } from '@/lib/mexico-date';
import { getDefaultTenant } from '@/lib/tenant';

async function requireProfit() {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return { auth };
  const denied = await requireStaffPermission(
    auth,
    'profit.view',
    'No tienes permiso para ver utilidades',
  );
  if (denied) return { auth: denied };
  return { auth };
}

export async function GET(request: Request) {
  const gate = await requireProfit();
  if (gate.auth instanceof NextResponse) return gate.auth;

  try {
    const { searchParams } = new URL(request.url);
    const range = resolveProfitDateRange(searchParams.get('from'), searchParams.get('to'));
    if (!range.ok) {
      return NextResponse.json({ error: range.error }, { status: 400 });
    }

    const tenant = await getDefaultTenant();
    const position = await fetchMoneyPosition(tenant.branchId, range.start, range.end);
    return NextResponse.json({ position });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar caja y cuenta' },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const gate = await requireProfit();
  if (gate.auth instanceof NextResponse) return gate.auth;

  try {
    const tenant = await getDefaultTenant();
    const body = (await request.json()) as {
      cashAmount?: number;
      accountAmount?: number;
      asOfDate?: string;
      notes?: string | null;
    };
    const asOfDate = (body.asOfDate ?? '').trim();
    const input = {
      cashAmount: Number(body.cashAmount),
      accountAmount: Number(body.accountAmount),
      asOfDate,
      notes: body.notes ?? null,
    };
    const validationError = validateMoneyPositionInput(input);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const range = resolveProfitDateRange(asOfDate, asOfDate);
    if (!range.ok) {
      return NextResponse.json({ error: range.error }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from('branch_money_positions').upsert(
      {
        branch_id: tenant.branchId,
        as_of_date: asOfDate,
        cash_amount: input.cashAmount,
        account_amount: input.accountAmount,
        notes: input.notes?.trim() ? input.notes.trim() : null,
        created_by: gate.auth.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'branch_id,as_of_date' },
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const position = await fetchMoneyPosition(tenant.branchId, asOfDate, asOfDate);
    return NextResponse.json({ position });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al guardar caja y cuenta' },
      { status: 500 },
    );
  }
}
