import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';

function todayMexico(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
  }).format(new Date());
}

export async function GET() {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const supabase = createAdminClient();
  const closingDate = todayMexico();
  const startOfDay = `${closingDate}T00:00:00-06:00`;
  const endOfDay = `${closingDate}T23:59:59-06:00`;

  const [{ data: orders }, { data: closing }] = await Promise.all([
    supabase
      .from('orders')
      .select('total, payment_method, payment_status, paid_at')
      .eq('branch_id', auth.branchId)
      .eq('payment_status', 'paid')
      .gte('paid_at', startOfDay)
      .lte('paid_at', endOfDay),
    supabase
      .from('daily_cash_closings')
      .select('*')
      .eq('branch_id', auth.branchId)
      .eq('closing_date', closingDate)
      .maybeSingle(),
  ]);

  const totals = { cash: 0, card_terminal: 0, transfer: 0, online: 0 };
  for (const order of orders ?? []) {
    const method = order.payment_method ?? 'cash';
    if (method in totals) {
      totals[method as keyof typeof totals] += Number(order.total);
    }
  }

  return NextResponse.json({
    closingDate,
    branchName: auth.branchName,
    totals,
    orderCount: orders?.length ?? 0,
    grandTotal: Object.values(totals).reduce((sum, value) => sum + value, 0),
    closing: closing ?? null,
  });
}

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as { notes?: string };
  const supabase = createAdminClient();
  const closingDate = todayMexico();
  const startOfDay = `${closingDate}T00:00:00-06:00`;
  const endOfDay = `${closingDate}T23:59:59-06:00`;

  const { data: orders } = await supabase
    .from('orders')
    .select('total, payment_method')
    .eq('branch_id', auth.branchId)
    .eq('payment_status', 'paid')
    .gte('paid_at', startOfDay)
    .lte('paid_at', endOfDay);

  const totals = { cash: 0, card_terminal: 0, transfer: 0 };
  for (const order of orders ?? []) {
    const method = order.payment_method;
    if (method === 'cash' || method === 'card_terminal' || method === 'transfer') {
      totals[method] += Number(order.total);
    } else if (!method) {
      totals.cash += Number(order.total);
    }
  }

  const { data, error } = await supabase
    .from('daily_cash_closings')
    .upsert(
      {
        branch_id: auth.branchId,
        closing_date: closingDate,
        cash_total: totals.cash,
        card_terminal_total: totals.card_terminal,
        transfer_total: totals.transfer,
        notes: body.notes?.trim() || null,
        closed_by: auth.userId,
      },
      { onConflict: 'branch_id,closing_date' },
    )
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, closing: data });
}
