import { NextResponse } from 'next/server';

import { quantityForWeighedWaste, validateTransformProduce } from '@puertaverde/shared';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { transformProduce } from '@/lib/transform-produce';

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

  try {
    const result = await transformProduce({
      sourceBranchProductId,
      destBranchProductId,
      sourceQuantity,
      destQuantity,
      destUnit: body.destUnit,
      notes: body.notes?.trim() || null,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo transformar' },
      { status: 400 },
    );
  }
}
