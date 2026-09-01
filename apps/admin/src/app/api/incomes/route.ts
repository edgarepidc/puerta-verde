import { NextResponse } from 'next/server';

import {
  isIncomeEntryType,
  validateIncomeEntryInput,
  type IncomeEntryInput,
} from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

const SELECT =
  'id, entry_type, concept, amount, entry_date, notes, created_at' as const;

export async function GET(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'profit.view',
    'No tienes permiso para ver utilidades',
  );
  if (denied) return denied;

  try {
    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    let query = supabase
      .from('income_entries')
      .select(SELECT)
      .eq('branch_id', tenant.branchId)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);

    const from = searchParams.get('from');
    const to = searchParams.get('to');
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
      query = query.gte('entry_date', from);
    }
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      query = query.lte('entry_date', to);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ incomes: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar aportaciones' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'profit.view',
    'No tienes permiso para ver utilidades',
  );
  if (denied) return denied;

  try {
    const tenant = await getDefaultTenant();
    const body = (await request.json()) as IncomeEntryInput;
    const validationError = validateIncomeEntryInput(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
    if (!isIncomeEntryType(body.entryType)) {
      return NextResponse.json({ error: 'Elige si es aportación u otro ingreso.' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('income_entries')
      .insert({
        branch_id: tenant.branchId,
        organization_id: tenant.organizationId,
        entry_type: body.entryType,
        concept: body.concept.trim(),
        amount: body.amount,
        entry_date: body.entryDate,
        notes: body.notes?.trim() ? body.notes.trim() : null,
        created_by: auth.userId,
      })
      .select(SELECT)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? 'No se pudo registrar el movimiento' },
        { status: 400 },
      );
    }

    return NextResponse.json({ income: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al registrar el movimiento' },
      { status: 500 },
    );
  }
}
