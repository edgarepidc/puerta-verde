import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

interface ExpensePatchBody {
  concept?: string;
  amount?: number;
  expenseDate?: string;
  notes?: string | null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const tenant = await getDefaultTenant();
    const body = (await request.json()) as ExpensePatchBody;

    if (body.concept !== undefined) {
      const concept = body.concept.trim();
      if (!concept) {
        return NextResponse.json({ error: 'El concepto es obligatorio.' }, { status: 400 });
      }
      if (concept.length > 120) {
        return NextResponse.json({ error: 'El concepto es demasiado largo.' }, { status: 400 });
      }
    }
    if (body.amount !== undefined && !(body.amount > 0)) {
      return NextResponse.json({ error: 'El monto debe ser mayor a cero.' }, { status: 400 });
    }
    if (body.expenseDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(body.expenseDate)) {
      return NextResponse.json({ error: 'La fecha del gasto es inválida.' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('expenses')
      .update({
        ...(body.concept !== undefined ? { concept: body.concept.trim() } : {}),
        ...(body.amount !== undefined ? { amount: body.amount } : {}),
        ...(body.expenseDate !== undefined ? { expense_date: body.expenseDate } : {}),
        ...(body.notes !== undefined
          ? { notes: body.notes?.trim() ? body.notes.trim() : null }
          : {}),
      })
      .eq('id', id)
      .eq('branch_id', tenant.branchId)
      .select('id, concept, amount, expense_date, notes, created_at')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ expense: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al actualizar gasto' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id)
      .eq('branch_id', tenant.branchId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al eliminar gasto' },
      { status: 500 },
    );
  }
}
