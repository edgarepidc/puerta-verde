import { NextResponse } from 'next/server';

import { alignLedgerClosing, validateMoneyPositionInput } from '@puertaverde/shared';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import {
  fetchMoneyLedger,
  fetchMoneyPosition,
  saveMoneyPositionSnapshot,
} from '@/lib/money-position';
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
    const [position, ledger] = await Promise.all([
      fetchMoneyPosition(tenant.branchId, range.start, range.end),
      fetchMoneyLedger(tenant.branchId, range.start, range.end),
    ]);
    return NextResponse.json({ position, ledger: alignLedgerClosing(ledger, position) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar caja y cuenta' },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'profit.adjust_cash',
    'No tienes permiso para ajustar caja y cuenta',
  );
  if (denied) return denied;

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

    const position = await saveMoneyPositionSnapshot({
      branchId: tenant.branchId,
      cashAmount: input.cashAmount,
      accountAmount: input.accountAmount,
      asOfDate,
      notes: input.notes,
      userId: auth.userId,
    });
    return NextResponse.json({ position });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al guardar caja y cuenta' },
      { status: 500 },
    );
  }
}
