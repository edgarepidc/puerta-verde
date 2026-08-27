import { NextResponse } from 'next/server';

import { validateProductInput, type ProductInput } from '@puertaverde/shared';
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
    'products.manage',
    'No tienes permiso para gestionar el catálogo',
  );
  if (denied) return denied;

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
        sku: body.sku?.trim() || null,
        image_url: body.imageUrl?.trim() || null,
        shelf_life_days: body.shelfLifeDays ?? null,
        is_active: body.isActive,
        ...(body.weighAtFulfillment != null
          ? { weigh_at_fulfillment: Boolean(body.weighAtFulfillment) }
          : {}),
      })
      .eq('id', productId)
      .eq('organization_id', tenant.organizationId);

    if (productError) {
      if (
        body.weighAtFulfillment != null &&
        /weigh_at_fulfillment/i.test(productError.message)
      ) {
        return NextResponse.json(
          {
            error:
              'Falta aplicar la migración de “pesar al preparar”. Corre el SQL en Supabase y vuelve a guardar.',
          },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: productError.message }, { status: 400 });
    }

    const branchUpdates: {
      price: number;
      is_available: boolean;
      avg_unit_cost?: number;
      last_unit_cost?: number;
      min_stock?: number;
    } = {
      price: body.price,
      is_available: body.isAvailable,
    };
    if (body.unitCost != null && body.unitCost >= 0) {
      branchUpdates.avg_unit_cost = body.unitCost;
      branchUpdates.last_unit_cost = body.unitCost;
    }
    if (body.minStock != null && body.minStock >= 0) {
      branchUpdates.min_stock = body.minStock;
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
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'products.manage',
    'No tienes permiso para gestionar el catálogo',
  );
  if (denied) return denied;

  try {
    const { id: productId } = await params;
    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();

    let body: {
      branchProductId?: string;
      mergeIntoBranchProductId?: string;
    } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      body = {};
    }

    if (body.branchProductId && body.mergeIntoBranchProductId) {
      const { data: fromBp } = await supabase
        .from('branch_products')
        .select('id, product_id, branch_id')
        .eq('id', body.branchProductId)
        .eq('branch_id', tenant.branchId)
        .maybeSingle();
      const { data: intoBp } = await supabase
        .from('branch_products')
        .select('id, product_id, branch_id')
        .eq('id', body.mergeIntoBranchProductId)
        .eq('branch_id', tenant.branchId)
        .maybeSingle();

      if (!fromBp || !intoBp) {
        return NextResponse.json({ error: 'Producto a unir no encontrado' }, { status: 404 });
      }
      if (fromBp.product_id !== productId) {
        return NextResponse.json(
          { error: 'El producto a eliminar no coincide con la fila' },
          { status: 400 },
        );
      }

      const { error: mergeError } = await supabase.rpc('merge_branch_products', {
        p_from_branch_product_id: body.branchProductId,
        p_into_branch_product_id: body.mergeIntoBranchProductId,
      });

      if (mergeError) {
        return NextResponse.json(
          {
            error:
              /merge_branch_products|function .* does not exist/i.test(mergeError.message)
                ? 'Falta aplicar el SQL de unir duplicados (merge_branch_products). Corre la migración en Supabase.'
                : mergeError.message,
          },
          { status: 400 },
        );
      }

      return NextResponse.json({ ok: true, merged: true });
    }

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId)
      .eq('organization_id', tenant.organizationId);

    if (error) {
      if (/foreign key|purchase_items|order_items|inventory_movements/i.test(error.message)) {
        return NextResponse.json(
          {
            error:
              'Este producto tiene historial (compras o ventas). Si es un duplicado, elimina eligiendo unirlo al otro del mismo nombre.',
            code: 'HAS_HISTORY',
          },
          { status: 409 },
        );
      }
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
