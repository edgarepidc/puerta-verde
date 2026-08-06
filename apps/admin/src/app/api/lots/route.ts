import { NextResponse } from 'next/server';

import { buildPtiLabelString } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export async function GET(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const { searchParams } = new URL(request.url);
    const traceCode = searchParams.get('trace');

    const supabase = createAdminClient();

    if (traceCode) {
      const { data, error } = await supabase.rpc('get_lot_traceability', {
        p_lot_code: traceCode,
        p_branch_id: tenant.branchId,
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ trace: data?.[0] ?? null });
    }

    const { data: lots, error } = await supabase
      .from('product_lots')
      .select(`
        id,
        lot_code,
        gtin,
        supplier_name,
        pack_date,
        expires_at,
        quantity_received,
        quantity_remaining,
        pti_label,
        created_at,
        branch_product:branch_products (
          product:products ( name, unit )
        )
      `)
      .eq('branch_id', tenant.branchId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ lots: lots ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar lotes' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const body = (await request.json()) as {
      branchProductId: string;
      lotCode: string;
      quantity: number;
      gtin?: string | null;
      supplierName?: string | null;
      packDate?: string | null;
      expiresAt?: string | null;
      notes?: string | null;
    };

    if (!body.branchProductId || !body.lotCode?.trim() || body.quantity <= 0) {
      return NextResponse.json({ error: 'Producto, lote y cantidad son obligatorios' }, { status: 400 });
    }

    const ptiLabel = buildPtiLabelString({
      gtin: body.gtin,
      lotCode: body.lotCode.trim(),
      packDate: body.packDate,
    });

    const supabase = createAdminClient();

    const { data: branchProduct } = await supabase
      .from('branch_products')
      .select('id')
      .eq('id', body.branchProductId)
      .eq('branch_id', tenant.branchId)
      .single();

    if (!branchProduct) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('receive_product_lot', {
      p_branch_product_id: body.branchProductId,
      p_lot_code: body.lotCode.trim(),
      p_quantity: body.quantity,
      p_gtin: body.gtin ?? null,
      p_supplier_name: body.supplierName ?? null,
      p_pack_date: body.packDate ?? null,
      p_expires_at: body.expiresAt ?? null,
      p_pti_label: ptiLabel || null,
      p_notes: body.notes ?? null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const row = data?.[0] as { lot_id: string; new_stock: number } | undefined;
    return NextResponse.json({ lotId: row?.lot_id, newStock: row?.new_stock });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al registrar lote' },
      { status: 500 },
    );
  }
}
