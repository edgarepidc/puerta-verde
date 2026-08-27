import { NextResponse } from 'next/server';

import {
  getDefaultLowStockThreshold,
  validateProductInput,
  type ProductInput,
  type ProductUnit,
} from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

const PRODUCT_SELECT = `
  id,
  price,
  stock,
  min_stock,
  avg_unit_cost,
  last_unit_cost,
  is_available,
  product:products (
    id,
    name,
    description,
    unit,
    sku,
    image_url,
    is_active,
    shelf_life_days,
    category_id,
    category:product_categories ( id, name )
  )
`;

/** Extended select once weigh_at_fulfillment migration is applied. */
const PRODUCT_SELECT_WITH_WEIGH = `
  id,
  price,
  stock,
  min_stock,
  avg_unit_cost,
  last_unit_cost,
  is_available,
  product:products (
    id,
    name,
    description,
    unit,
    sku,
    image_url,
    is_active,
    shelf_life_days,
    weigh_at_fulfillment,
    category_id,
    category:product_categories ( id, name )
  )
`;

export async function GET() {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();

    const [{ data: productsWithWeigh, error: productsWithWeighError }, { data: categories }] =
      await Promise.all([
        supabase
          .from('branch_products')
          .select(PRODUCT_SELECT_WITH_WEIGH)
          .eq('branch_id', tenant.branchId)
          .order('created_at', { ascending: true }),
        supabase
          .from('product_categories')
          .select('id, name, sort_order')
          .eq('organization_id', tenant.organizationId)
          .order('sort_order'),
      ]);

    let products: unknown[] = productsWithWeigh ?? [];
    if (productsWithWeighError) {
      const missingWeigh = /weigh_at_fulfillment/i.test(productsWithWeighError.message);
      if (!missingWeigh) {
        return NextResponse.json({ error: productsWithWeighError.message }, { status: 400 });
      }
      const { data: fallback, error: fallbackError } = await supabase
        .from('branch_products')
        .select(PRODUCT_SELECT)
        .eq('branch_id', tenant.branchId)
        .order('created_at', { ascending: true });
      if (fallbackError) {
        return NextResponse.json({ error: fallbackError.message }, { status: 400 });
      }
      products = fallback ?? [];
    }

    return NextResponse.json({
      tenant,
      categories: categories ?? [],
      products,
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

  const denied = await requireStaffPermission(
    auth,
    'products.manage',
    'No tienes permiso para gestionar el catálogo',
  );
  if (denied) return denied;

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
        sku: body.sku?.trim() || null,
        image_url: body.imageUrl?.trim() || null,
        shelf_life_days: body.shelfLifeDays ?? null,
        is_active: body.isActive,
        ...(body.weighAtFulfillment != null
          ? { weigh_at_fulfillment: Boolean(body.weighAtFulfillment) }
          : {}),
      })
      .select('id')
      .single();

    if (productError || !product) {
      if (productError && /weigh_at_fulfillment/i.test(productError.message)) {
        return NextResponse.json(
          {
            error:
              'Falta aplicar la migración de “pesar al preparar”. Corre el SQL en Supabase y vuelve a crear el producto.',
          },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: productError?.message ?? 'No se pudo crear producto' }, { status: 400 });
    }

    const openingStock = Number(body.stock ?? 0);
    const { data: branchProduct, error: branchError } = await supabase
      .from('branch_products')
      .insert({
        branch_id: tenant.branchId,
        product_id: product.id,
        price: body.price,
        stock: 0,
        avg_unit_cost: body.unitCost ?? 0,
        last_unit_cost: body.unitCost ?? null,
        min_stock:
          body.minStock ??
          getDefaultLowStockThreshold({
            unit: body.unit,
            name: body.name,
          }),
        is_available: body.isAvailable,
      })
      .select('id')
      .single();

    if (branchError || !branchProduct) {
      await supabase.from('products').delete().eq('id', product.id);
      return NextResponse.json({ error: branchError?.message ?? 'No se pudo asignar a sucursal' }, { status: 400 });
    }

    if (openingStock > 0) {
      const { error: movementError } = await supabase.rpc('record_inventory_movement', {
        p_branch_product_id: branchProduct.id,
        p_movement_type: body.unitCost && body.unitCost > 0 ? 'purchase' : 'adjustment',
        p_quantity: openingStock,
        p_notes: 'Inventario inicial',
        p_expires_at: null,
        p_unit_cost: body.unitCost ?? null,
      });
      if (movementError) {
        return NextResponse.json({ error: movementError.message }, { status: 400 });
      }
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
