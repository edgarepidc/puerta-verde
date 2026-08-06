import { NextResponse } from 'next/server';

import { validateInventoryMovement, type InventoryMovementInput } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export async function GET() {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();

    const [{ data: products }, { data: movements }] = await Promise.all([
      supabase
        .from('branch_products')
        .select(`
          id,
          stock,
          is_available,
          product:products ( id, name, unit )
        `)
        .eq('branch_id', tenant.branchId)
        .order('created_at', { ascending: true }),
      supabase
        .from('inventory_movements')
        .select(`
          id,
          movement_type,
          quantity,
          notes,
          expires_at,
          created_at,
          branch_product:branch_products (
            product:products ( name )
          )
        `)
        .eq('branch_id', tenant.branchId)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    return NextResponse.json({
      tenant,
      products: products ?? [],
      movements: movements ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar inventario' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const body = (await request.json()) as InventoryMovementInput;
    const validationError = validateInventoryMovement(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: branchProduct } = await supabase
      .from('branch_products')
      .select('id')
      .eq('id', body.branchProductId)
      .eq('branch_id', tenant.branchId)
      .single();

    if (!branchProduct) {
      return NextResponse.json({ error: 'Producto no encontrado en esta sucursal' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('record_inventory_movement', {
      p_branch_product_id: body.branchProductId,
      p_movement_type: body.movementType,
      p_quantity: body.quantity,
      p_notes: body.notes ?? null,
      p_expires_at: body.expiresAt ?? null,
      p_unit_cost: body.unitCost ?? null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const row = data?.[0] as { new_stock: number; new_avg_unit_cost: number } | undefined;
    return NextResponse.json({
      newStock: row?.new_stock ?? null,
      newAvgUnitCost: row?.new_avg_unit_cost ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al registrar movimiento' },
      { status: 500 },
    );
  }
}
