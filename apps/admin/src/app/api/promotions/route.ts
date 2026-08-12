import { NextResponse } from 'next/server';

import { validatePromotionInput, type PromotionInput } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export async function GET() {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();

    const { data: promotions, error } = await supabase
      .from('promotions')
      .select('*')
      .eq('branch_id', tenant.branchId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ tenant, promotions: promotions ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar promociones' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const body = (await request.json()) as PromotionInput;
    const validationError = validatePromotionInput(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('promotions')
      .insert({
        branch_id: tenant.branchId,
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
      .select('id')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'No se pudo crear' }, { status: 400 });
    }

    return NextResponse.json({ id: data.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al crear promoción' },
      { status: 500 },
    );
  }
}
