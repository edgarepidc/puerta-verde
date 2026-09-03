import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { todayMexicoYmd } from '@/lib/mexico-date';

/** GET /api/cash-withdrawals?date=YYYY-MM-DD — list withdrawals for a day */
export async function GET(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const rawDate = searchParams.get('date')?.trim() ?? '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayMexicoYmd();

  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('cash_withdrawals')
    .select('id, amount, withdrawal_date, withdrawn_at, notes')
    .eq('branch_id', auth.branchId)
    .eq('withdrawal_date', date)
    .order('withdrawn_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ withdrawals: data ?? [] });
}

/** POST /api/cash-withdrawals — register a new withdrawal */
export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'cash.closing',
    'No tienes permiso para registrar retiros',
  );
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as {
    amount?: unknown;
    notes?: unknown;
    date?: unknown;
  };

  const amount = Number(body.amount);
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Monto inválido' }, { status: 400 });
  }

  const rawDate = typeof body.date === 'string' ? body.date.trim() : '';
  const withdrawalDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayMexicoYmd();
  const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;

  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('cash_withdrawals')
    .insert({
      branch_id: auth.branchId,
      amount,
      withdrawal_date: withdrawalDate,
      notes,
      created_by: auth.userId,
    })
    .select('id, amount, withdrawal_date, withdrawn_at, notes')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ withdrawal: data });
}

/** DELETE /api/cash-withdrawals?id=UUID — delete a withdrawal */
export async function DELETE(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'cash.closing',
    'No tienes permiso para eliminar retiros',
  );
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 });

  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('cash_withdrawals')
    .delete()
    .eq('id', id)
    .eq('branch_id', auth.branchId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
