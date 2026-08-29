import { NextResponse } from 'next/server';

import { validateExpenseInput, type ExpenseInput } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export async function GET(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    let query = supabase
      .from('expenses')
      .select('id, concept, amount, expense_date, notes, created_at')
      .eq('branch_id', tenant.branchId)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);

    if (date) {
      query = query.eq('expense_date', date);
    }
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
      query = query.gte('expense_date', from);
    }
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      query = query.lte('expense_date', to);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ expenses: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar gastos' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const body = (await request.json()) as ExpenseInput;
    const validationError = validateExpenseInput(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        branch_id: tenant.branchId,
        organization_id: tenant.organizationId,
        concept: body.concept.trim(),
        amount: body.amount,
        expense_date: body.expenseDate,
        notes: body.notes?.trim() ? body.notes.trim() : null,
        created_by: auth.userId,
      })
      .select('id, concept, amount, expense_date, notes, created_at')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'No se pudo registrar el gasto' }, { status: 400 });
    }

    return NextResponse.json({ expense: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al registrar gasto' },
      { status: 500 },
    );
  }
}
