import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';

export async function GET() {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('product_categories')
      .select('id, name, sort_order, low_stock_threshold')
      .eq('organization_id', auth.organizationId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ categories: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar umbrales' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'stock.thresholds',
    'No tienes permiso para editar límites de stock bajo',
  );
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      thresholds?: Array<{ categoryId: string; threshold: number }>;
    };
    const rows = Array.isArray(body.thresholds) ? body.thresholds : [];
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
    }

    for (const row of rows) {
      const threshold = Number(row.threshold);
      if (!row.categoryId || !Number.isFinite(threshold) || threshold < 0) {
        return NextResponse.json({ error: 'Umbral no válido' }, { status: 400 });
      }
    }

    const supabase = createAdminClient();
    let updatedCategories = 0;
    let updatedProducts = 0;

    for (const row of rows) {
      const threshold = Number(row.threshold);
      const { data: category, error: catErr } = await supabase
        .from('product_categories')
        .update({ low_stock_threshold: threshold })
        .eq('id', row.categoryId)
        .eq('organization_id', auth.organizationId)
        .select('id')
        .maybeSingle();

      if (catErr) {
        return NextResponse.json({ error: catErr.message }, { status: 400 });
      }
      if (!category) continue;
      updatedCategories++;

      const { data: products } = await supabase
        .from('products')
        .select('id')
        .eq('organization_id', auth.organizationId)
        .eq('category_id', row.categoryId);

      const productIds = (products ?? []).map((p) => p.id);
      if (productIds.length === 0) continue;

      const { error: bpErr, count } = await supabase
        .from('branch_products')
        .update({ min_stock: threshold }, { count: 'exact' })
        .eq('branch_id', auth.branchId)
        .in('product_id', productIds);

      if (bpErr) {
        return NextResponse.json({ error: bpErr.message }, { status: 400 });
      }
      updatedProducts += count ?? 0;
    }

    const { data: categories } = await supabase
      .from('product_categories')
      .select('id, name, sort_order, low_stock_threshold')
      .eq('organization_id', auth.organizationId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    return NextResponse.json({
      ok: true,
      updatedCategories,
      updatedProducts,
      categories: categories ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al guardar umbrales' },
      { status: 500 },
    );
  }
}
