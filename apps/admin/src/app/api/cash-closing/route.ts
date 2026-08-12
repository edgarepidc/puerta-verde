import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';

function todayMexico(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
  }).format(new Date());
}

function emptyMethodTotals() {
  return { cash: 0, card_terminal: 0, transfer: 0, online: 0 };
}

function isPosOrder(order: {
  source?: string | null;
  delivery_notes?: string | null;
}) {
  if (order.source === 'pos') return true;
  return (order.delivery_notes ?? '').startsWith('[mostrador]');
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
      .select('total, payment_method, payment_status, paid_at, delivery_notes')
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

  const totals = emptyMethodTotals();
  const pos = emptyMethodTotals();
  const web = emptyMethodTotals();
  let posCount = 0;
  let webCount = 0;

  for (const order of orders ?? []) {
    const method = (order.payment_method ?? 'cash') as keyof typeof totals;
    const amount = Number(order.total);
    if (!(method in totals)) continue;
    totals[method] += amount;
    if (isPosOrder(order)) {
      pos[method] += amount;
      posCount += 1;
    } else {
      web[method] += amount;
      webCount += 1;
    }
  }

  return NextResponse.json({
    closingDate,
    branchName: auth.branchName,
    totals,
    channels: {
      pos: { ...pos, orderCount: posCount, total: Object.values(pos).reduce((a, b) => a + b, 0) },
      web: { ...web, orderCount: webCount, total: Object.values(web).reduce((a, b) => a + b, 0) },
    },
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

  const totals = { cash: 0, card_terminal: 0, transfer: 0, online: 0 };
  for (const order of orders ?? []) {
    const method = order.payment_method;
    if (method === 'cash' || method === 'card_terminal' || method === 'transfer' || method === 'online') {
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

  return NextResponse.json({ ok: true, closing: data, totals });
}
