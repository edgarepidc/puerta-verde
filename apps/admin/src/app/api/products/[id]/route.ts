import { NextResponse } from 'next/server';

import { validateProductInput, type ProductInput } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id: productId } = await params;
    const tenant = await getDefaultTenant();
    const body = (await request.json()) as ProductInput & {
      branchProductId: string;
      newCategoryName?: string;
    };

    const validationError = validateProductInput(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const supabase = createAdminClient();
    let categoryId = body.categoryId ?? null;

    if (body.newCategoryName?.trim()) {
      const { data: category, error: categoryError } = await supabase
        .from('product_categories')
        .insert({
          organization_id: tenant.organizationId,
          name: body.newCategoryName.trim(),
        })
        .select('id')
        .single();

      if (categoryError || !category) {
        return NextResponse.json({ error: categoryError?.message ?? 'No se pudo crear categoría' }, { status: 400 });
      }
      categoryId = category.id;
    }

    const { error: productError } = await supabase
      .from('products')
      .update({
        name: body.name.trim(),
        description: body.description?.trim() || null,
        category_id: categoryId,
        unit: body.unit,
        image_url: body.imageUrl?.trim() || null,
        shelf_life_days: body.shelfLifeDays ?? null,
        is_active: body.isActive,
      })
      .eq('id', productId)
      .eq('organization_id', tenant.organizationId);

    if (productError) {
      return NextResponse.json({ error: productError.message }, { status: 400 });
    }

    const branchUpdates: {
      price: number;
      stock: number;
      is_available: boolean;
      avg_unit_cost?: number;
      last_unit_cost?: number;
    } = {
      price: body.price,
      stock: body.stock,
      is_available: body.isAvailable,
    };
    if (body.unitCost != null && body.unitCost >= 0) {
      branchUpdates.avg_unit_cost = body.unitCost;
      branchUpdates.last_unit_cost = body.unitCost;
    }

    const { error: branchError } = await supabase
      .from('branch_products')
      .update(branchUpdates)
      .eq('id', body.branchProductId)
      .eq('branch_id', tenant.branchId);

    if (branchError) {
      return NextResponse.json({ error: branchError.message }, { status: 400 });
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

  try {
    const { id: productId } = await params;
    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId)
      .eq('organization_id', tenant.organizationId);

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
