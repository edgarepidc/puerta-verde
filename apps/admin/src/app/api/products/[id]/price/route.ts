import { NextResponse } from 'next/server';

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
    const body = (await request.json()) as { branchProductId?: string; price?: number };
    const price = Number(body.price);
    const branchProductId = body.branchProductId?.trim() ?? '';

    if (!branchProductId) {
      return NextResponse.json({ error: 'Producto de sucursal requerido' }, { status: 400 });
    }
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: 'Precio inválido' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: product } = await supabase
      .from('products')
      .select('id')
      .eq('id', productId)
      .eq('organization_id', tenant.organizationId)
      .maybeSingle();

    if (!product) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }

    const { error } = await supabase
      .from('branch_products')
      .update({ price })
      .eq('id', branchProductId)
      .eq('branch_id', tenant.branchId)
      .eq('product_id', productId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, price });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al actualizar precio' },
      { status: 500 },
    );
  }
}
