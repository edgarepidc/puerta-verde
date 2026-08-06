import { NextResponse } from 'next/server';

import { validateProductInput, type ProductInput, type ProductUnit } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export async function GET() {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();

    const [{ data: products }, { data: categories }] = await Promise.all([
      supabase
        .from('branch_products')
        .select(`
          id,
          price,
          stock,
          avg_unit_cost,
          last_unit_cost,
          is_available,
          product:products (
            id,
            name,
            description,
            unit,
            is_active,
            shelf_life_days,
            category_id,
            category:product_categories ( id, name )
          )
        `)
        .eq('branch_id', tenant.branchId)
        .order('created_at', { ascending: true }),
      supabase
        .from('product_categories')
        .select('id, name, sort_order')
        .eq('organization_id', tenant.organizationId)
        .order('sort_order'),
    ]);

    return NextResponse.json({
      tenant,
      categories: categories ?? [],
      products: products ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar productos' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const body = (await request.json()) as ProductInput & { newCategoryName?: string };
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

    const { data: product, error: productError } = await supabase
      .from('products')
      .insert({
        organization_id: tenant.organizationId,
        category_id: categoryId,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        unit: body.unit,
        shelf_life_days: body.shelfLifeDays ?? null,
        is_active: body.isActive,
      })
      .select('id')
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: productError?.message ?? 'No se pudo crear producto' }, { status: 400 });
    }

    const { data: branchProduct, error: branchError } = await supabase
      .from('branch_products')
      .insert({
        branch_id: tenant.branchId,
        product_id: product.id,
        price: body.price,
        stock: body.stock,
        avg_unit_cost: body.unitCost ?? 0,
        last_unit_cost: body.unitCost ?? null,
        is_available: body.isAvailable,
      })
      .select('id')
      .single();

    if (branchError || !branchProduct) {
      await supabase.from('products').delete().eq('id', product.id);
      return NextResponse.json({ error: branchError?.message ?? 'No se pudo asignar a sucursal' }, { status: 400 });
    }

    return NextResponse.json({ productId: product.id, branchProductId: branchProduct.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al crear producto' },
      { status: 500 },
    );
  }
}

export type AdminProductPayload = ProductInput & {
  productId: string;
  branchProductId: string;
  unit: ProductUnit;
};
