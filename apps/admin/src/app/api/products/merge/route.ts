import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';

/**
 * Unite a duplicate branch_product into another (same org), then delete the source.
 * Body: { fromBranchProductId, intoBranchProductId }
 */
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
    const body = (await request.json()) as {
      fromBranchProductId?: string;
      intoBranchProductId?: string;
    };

    const fromId = body.fromBranchProductId?.trim();
    const intoId = body.intoBranchProductId?.trim();
    if (!fromId || !intoId) {
      return NextResponse.json(
        { error: 'Indica el producto duplicado y el destino' },
        { status: 400 },
      );
    }
    if (fromId === intoId) {
      return NextResponse.json(
        { error: 'No se puede unir un producto consigo mismo' },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    const { data: fromBp, error: fromError } = await supabase
      .from('branch_products')
      .select('id, product_id, branch_id, branch:branches ( id, organization_id )')
      .eq('id', fromId)
      .maybeSingle();

    const { data: intoBp, error: intoError } = await supabase
      .from('branch_products')
      .select('id, product_id, branch_id, branch:branches ( id, organization_id )')
      .eq('id', intoId)
      .maybeSingle();

    if (fromError || intoError) {
      return NextResponse.json(
        { error: fromError?.message ?? intoError?.message ?? 'Error al buscar productos' },
        { status: 400 },
      );
    }

    if (!fromBp) {
      return NextResponse.json(
        { error: `No encontré el producto a eliminar (${fromId.slice(0, 8)}…)` },
        { status: 404 },
      );
    }
    if (!intoBp) {
      return NextResponse.json(
        { error: `No encontré el producto destino (${intoId.slice(0, 8)}…)` },
        { status: 404 },
      );
    }

    const fromBranch = Array.isArray(fromBp.branch) ? fromBp.branch[0] : fromBp.branch;
    const intoBranch = Array.isArray(intoBp.branch) ? intoBp.branch[0] : intoBp.branch;
    const fromOrg = fromBranch?.organization_id;
    const intoOrg = intoBranch?.organization_id;

    if (fromOrg !== auth.organizationId || intoOrg !== auth.organizationId) {
      return NextResponse.json(
        { error: 'Esos productos no pertenecen a tu organización' },
        { status: 403 },
      );
    }

    if (fromBp.branch_id !== intoBp.branch_id) {
      return NextResponse.json(
        { error: 'Solo se pueden unir productos de la misma sucursal' },
        { status: 400 },
      );
    }

    const { error: mergeError } = await supabase.rpc('merge_branch_products', {
      p_from_branch_product_id: fromId,
      p_into_branch_product_id: intoId,
    });

    if (mergeError) {
      return NextResponse.json(
        {
          error:
            /merge_branch_products|Could not find the function|does not exist/i.test(
              mergeError.message,
            )
              ? 'Falta aplicar el SQL merge_branch_products en Supabase.'
              : mergeError.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, merged: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al unir productos' },
      { status: 500 },
    );
  }
}
