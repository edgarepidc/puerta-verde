import { NextResponse } from 'next/server';

import {
  OPERATING_COST_PERIODS,
  OPERATING_COST_TYPES,
  costAppliesToRange,
  normalizeChargeDay,
  type OperatingCostInput,
  type OperatingCostTerm,
} from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { addMexicoDays, isValidYmd } from '@/lib/mexico-date';
import { getDefaultTenant } from '@/lib/tenant';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'profit.view',
    'No tienes permiso para gestionar costos',
  );
  if (denied) return denied;

  try {
    const { id } = await params;
    const tenant = await getDefaultTenant();
    const body = (await request.json()) as Partial<OperatingCostInput> & {
      applies?: boolean;
      periodStart?: string;
    };
    const updates: Partial<{
      name: string;
      cost_type: OperatingCostInput['costType'];
      period: OperatingCostInput['period'];
      amount: number;
      notes: string | null;
      is_active: boolean;
      paid_from: 'cash' | 'account';
      charge_day: number;
    }> = {};
    if (body.name?.trim()) updates.name = body.name.trim();
    if (body.costType && OPERATING_COST_TYPES.includes(body.costType)) {
      updates.cost_type = body.costType;
    }
    if (body.period && OPERATING_COST_PERIODS.includes(body.period)) {
      updates.period = body.period;
    }
    if (body.amount != null) {
      if (body.amount < 0) {
        return NextResponse.json({ error: 'El monto no puede ser negativo' }, { status: 400 });
      }
      updates.amount = body.amount;
    }
    if (body.notes !== undefined) updates.notes = body.notes?.trim() || null;
    if (body.paidFrom === 'cash' || body.paidFrom === 'account') {
      updates.paid_from = body.paidFrom;
    }
    if (body.chargeDay != null) {
      const chargeDay = normalizeChargeDay(body.chargeDay, 0);
      if (chargeDay === 0) {
        return NextResponse.json({ error: 'El día tiene que ser del 1 al 31.' }, { status: 400 });
      }
      updates.charge_day = chargeDay;
    }

    const supabase = createAdminClient();
    const periodStart = body.periodStart?.trim();
    const toggling = body.applies !== undefined;

    if (toggling) {
      if (!periodStart || !isValidYmd(periodStart)) {
        return NextResponse.json({ error: 'El periodo no es válido' }, { status: 400 });
      }

      const { data: costRow, error: costError } = await supabase
        .from('branch_operating_costs')
        .select('id')
        .eq('id', id)
        .eq('branch_id', tenant.branchId)
        .maybeSingle();
      if (costError || !costRow) {
        return NextResponse.json({ error: 'No se encontró el costo' }, { status: 404 });
      }

      const { data: termRows, error: termsError } = await supabase
        .from('branch_operating_cost_terms')
        .select('id, start_date, end_date')
        .eq('cost_id', id);
      if (termsError) {
        return NextResponse.json({ error: termsError.message }, { status: 400 });
      }

      const terms = (termRows ?? []) as OperatingCostTerm[];
      const alreadyApplies = costAppliesToRange(terms, periodStart, periodStart);

      if (body.applies && !alreadyApplies) {
        const { error: insertError } = await supabase.from('branch_operating_cost_terms').insert({
          cost_id: id,
          start_date: periodStart,
          end_date: null,
        });
        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 400 });
        }
        updates.is_active = true;
      }

      if (!body.applies && alreadyApplies) {
        const pauseUntil = addMexicoDays(periodStart, -1);
        for (const term of termRows ?? []) {
          const coversFromHere =
            term.start_date <= periodStart &&
            (term.end_date == null || term.end_date >= periodStart);
          const startsFromHere = term.start_date >= periodStart;
          if (!coversFromHere && !startsFromHere) continue;

          if (term.start_date > periodStart) {
            const { error: deleteError } = await supabase
              .from('branch_operating_cost_terms')
              .delete()
              .eq('id', term.id);
            if (deleteError) {
              return NextResponse.json({ error: deleteError.message }, { status: 400 });
            }
          } else {
            const { error: closeError } = await supabase
              .from('branch_operating_cost_terms')
              .update({ end_date: pauseUntil })
              .eq('id', term.id);
            if (closeError) {
              return NextResponse.json({ error: closeError.message }, { status: 400 });
            }
          }
        }
        updates.is_active = false;
      }
    } else if (body.isActive !== undefined) {
      updates.is_active = body.isActive;
    }

    if (!Object.keys(updates).length && !toggling) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
    }

    if (Object.keys(updates).length) {
      const { error } = await supabase
        .from('branch_operating_costs')
        .update(updates)
        .eq('id', id)
        .eq('branch_id', tenant.branchId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al actualizar' },
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

  const denied = await requireStaffPermission(
    auth,
    'profit.view',
    'No tienes permiso para gestionar costos',
  );
  if (denied) return denied;

  try {
    const { id } = await params;
    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('branch_operating_costs')
      .delete()
      .eq('id', id)
      .eq('branch_id', tenant.branchId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al eliminar' },
      { status: 500 },
    );
  }
}
