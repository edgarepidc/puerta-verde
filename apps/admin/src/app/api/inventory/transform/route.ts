import { NextResponse } from 'next/server';

import { quantityForWeighedWaste, validateTransformProduce } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'inventory.adjust',
    'No tienes permiso para transformar inventario',
  );
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as {
    sourceBranchProductId?: string;
    destBranchProductId?: string;
    sourceQuantity?: number;
    destQuantity?: number;
    destUnit?: string | null;
    notes?: string | null;
  };

  const sourceBranchProductId = body.sourceBranchProductId?.trim() ?? '';
  const destBranchProductId = body.destBranchProductId?.trim() ?? '';
  const sourceQuantity = quantityForWeighedWaste(Number(body.sourceQuantity));
  const destQuantity = Number(body.destQuantity);
  const validation = validateTransformProduce({
    sourceBranchProductId,
    destBranchProductId,
    sourceQuantity,
    destQuantity,
    destUnit: body.destUnit,
  });
  if (validation) {
    return NextResponse.json({ error: validation }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('transform_produce', {
    p_source_branch_product_id: sourceBranchProductId,
    p_source_quantity: sourceQuantity,
    p_dest_branch_product_id: destBranchProductId,
    p_dest_quantity: destQuantity,
    p_notes: body.notes?.trim() || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ ok: true, result: row ?? null });
}
