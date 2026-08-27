import { NextResponse } from 'next/server';

import { validatePromotionInput, type PromotionInput } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'promotions.manage',
    'No tienes permiso para gestionar promociones',
  );
  if (denied) return denied;

  try {
    const { id } = await params;
    const tenant = await getDefaultTenant();
    const body = (await request.json()) as PromotionInput;
    const validationError = validatePromotionInput(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('promotions')
      .update({
        title: body.title.trim(),
        body: body.body?.trim() || null,
        kind: body.kind,
        image_url: body.imageUrl?.trim() || null,
        discount_percent: body.kind === 'discount' ? body.discountPercent ?? null : null,
        product_id: body.kind === 'discount' ? body.productId || null : null,
        category_id: body.kind === 'discount' ? body.categoryId || null : null,
        starts_at: body.startsAt || null,
        ends_at: body.endsAt || null,
        is_active: body.isActive,
      })
      .eq('id', id)
      .eq('branch_id', tenant.branchId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
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
    'promotions.manage',
    'No tienes permiso para gestionar promociones',
  );
  if (denied) return denied;

  try {
    const { id } = await params;
    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('promotions')
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
