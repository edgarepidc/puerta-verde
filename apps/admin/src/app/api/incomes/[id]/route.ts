import { NextResponse } from 'next/server';

import { isIncomeEntryType } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

const SELECT =
  'id, entry_type, concept, amount, entry_date, notes, created_at' as const;

interface IncomePatchBody {
  entryType?: string;
  concept?: string;
  amount?: number;
  entryDate?: string;
  notes?: string | null;
}

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireProfit();
  if (gate.auth instanceof NextResponse) return gate.auth;

  try {
    const { id } = await params;
    const tenant = await getDefaultTenant();
    const body = (await request.json()) as IncomePatchBody;

    if (body.entryType !== undefined && !isIncomeEntryType(body.entryType)) {
      return NextResponse.json({ error: 'Elige si es aportación u otro ingreso.' }, { status: 400 });
    }
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
    if (body.entryDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(body.entryDate)) {
      return NextResponse.json({ error: 'La fecha es inválida.' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('income_entries')
      .update({
        ...(body.entryType !== undefined ? { entry_type: body.entryType } : {}),
        ...(body.concept !== undefined ? { concept: body.concept.trim() } : {}),
        ...(body.amount !== undefined ? { amount: body.amount } : {}),
        ...(body.entryDate !== undefined ? { entry_date: body.entryDate } : {}),
        ...(body.notes !== undefined
          ? { notes: body.notes?.trim() ? body.notes.trim() : null }
          : {}),
      })
      .eq('id', id)
      .eq('branch_id', tenant.branchId)
      .select(SELECT)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Movimiento no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ income: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al actualizar el movimiento' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireProfit();
  if (gate.auth instanceof NextResponse) return gate.auth;

  try {
    const { id } = await params;
    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('income_entries')
      .delete()
      .eq('id', id)
      .eq('branch_id', tenant.branchId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al eliminar el movimiento' },
      { status: 500 },
    );
  }
}
