import { NextResponse } from 'next/server';

import { alignLedgerClosing } from '@puertaverde/shared';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { fetchMoneyLedger, fetchMoneyPosition } from '@/lib/money-position';
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

export async function PUT() {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json(
    {
      error:
        'Tienes ya no se ajusta a mano. Cada venta, gasto, renta, compra, depósito o cierre de caja lo mueve.',
    },
    { status: 403 },
  );
}
