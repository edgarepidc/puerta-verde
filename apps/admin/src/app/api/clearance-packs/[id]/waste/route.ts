import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'inventory.adjust',
    'No tienes permiso para tirar sobrantes',
  );
  if (denied) return denied;

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: pack, error } = await supabase
    .from('clearance_packs')
    .select('id, branch_id, branch_product_id, promotion_id, status, quantity_remaining')
    .eq('id', id)
    .maybeSingle();

  if (error || !pack) {
    return NextResponse.json({ error: 'Paquete no encontrado' }, { status: 404 });
  }
  if (pack.branch_id !== auth.branchId) {
    return NextResponse.json({ error: 'Paquete de otra sucursal' }, { status: 403 });
  }
  if (pack.status === 'wasted') {
    return NextResponse.json({ error: 'Ese paquete ya se tiró' }, { status: 400 });
  }

  const { data: branchProduct } = await supabase
    .from('branch_products')
    .select('id, stock, avg_unit_cost')
    .eq('id', pack.branch_product_id)
    .maybeSingle();

  const remaining = Number(branchProduct?.stock ?? pack.quantity_remaining ?? 0);
  if (!(remaining > 0)) {
    await supabase
      .from('clearance_packs')
      .update({ status: 'wasted', quantity_remaining: 0, updated_at: new Date().toISOString() })
      .eq('id', pack.id);
    if (pack.promotion_id) {
      await supabase.from('promotions').update({ is_active: false }).eq('id', pack.promotion_id);
    }
    return NextResponse.json({ ok: true, wasted: 0 });
  }

  const { error: wasteError } = await supabase.rpc('record_inventory_movement', {
    p_branch_product_id: pack.branch_product_id,
    p_movement_type: 'waste',
    p_quantity: remaining,
    p_notes: 'Sobrantes de paquete de último momento',
    p_expires_at: null,
    p_unit_cost: branchProduct?.avg_unit_cost ?? null,
  });
  if (wasteError) {
    return NextResponse.json({ error: wasteError.message }, { status: 400 });
  }

  const { error: statusError } = await supabase
    .from('clearance_packs')
    .update({ status: 'wasted', quantity_remaining: 0, updated_at: new Date().toISOString() })
    .eq('id', pack.id);
  if (statusError) {
    return NextResponse.json({ error: statusError.message }, { status: 400 });
  }

  if (pack.promotion_id) {
    await supabase.from('promotions').update({ is_active: false }).eq('id', pack.promotion_id);
  }

  return NextResponse.json({ ok: true, wasted: remaining });
}
