import { NextResponse } from 'next/server';

import { cashCloseValidationError, parseOptionalMoney } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { loadCashDay } from '@/lib/cash-day';
import { isValidYmd, todayMexicoYmd } from '@/lib/mexico-date';

export async function GET(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const rawDate = searchParams.get('date')?.trim() ?? '';
  const closingDate = isValidYmd(rawDate) ? rawDate : todayMexicoYmd();
  const summary = await loadCashDay(auth.branchId, closingDate);

  return NextResponse.json({
    ...summary,
    branchName: auth.branchName,
  });
}

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'cash.closing',
    'No tienes permiso para cerrar caja',
  );
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as {
    date?: string;
    notes?: string;
    openingFloat?: number | null;
    countedCash?: number | null;
  };

  const today = todayMexicoYmd();
  const requested = typeof body.date === 'string' ? body.date.trim() : today;
  if (!isValidYmd(requested)) {
    return NextResponse.json({ error: 'Fecha de cierre no válida' }, { status: 400 });
  }
  if (requested > today) {
    return NextResponse.json({ error: 'No se puede cerrar un día futuro' }, { status: 400 });
  }

  const summary = await loadCashDay(auth.branchId, requested);
  const notes = body.notes?.trim() || null;
  const countedCash = parseOptionalMoney(body.countedCash);
  const openingFloat = parseOptionalMoney(body.openingFloat);
  const validation = cashCloseValidationError({
    countedCash: body.countedCash,
    openingFloat: body.openingFloat,
    cashSales: summary.totals.cash,
    notes,
    cashLines: summary.cashLines,
  });
  if (validation) {
    return NextResponse.json({ error: validation }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('daily_cash_closings')
    .upsert(
      {
        branch_id: auth.branchId,
        closing_date: requested,
        cash_total: summary.totals.cash,
        card_terminal_total: summary.totals.card_terminal,
        transfer_total: summary.totals.transfer,
        notes,
        opening_float: openingFloat,
        counted_cash: countedCash,
        closed_by: auth.userId,
      },
      { onConflict: 'branch_id,closing_date' },
    )
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, closing: data, totals: summary.totals });
}
