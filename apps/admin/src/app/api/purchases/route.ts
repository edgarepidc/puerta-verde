import { NextResponse } from 'next/server';

import { validatePurchaseInput, type PurchaseInput } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export async function GET() {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();

    const [
      { data: purchases, error },
      { data: products },
      { data: suppliers },
      { data: expenses },
    ] = await Promise.all([
      supabase
        .from('purchases')
        .select(`
          id,
          purchased_at,
          notes,
          total_amount,
          created_at,
          supplier:suppliers ( id, name ),
          items:purchase_items (
            id,
            quantity,
            unit_price,
            line_total,
            quality,
            piece_count,
            branch_product:branch_products (
              id,
              product:products ( name, unit, weigh_at_fulfillment )
            )
          )
        `)
        .eq('branch_id', tenant.branchId)
        .order('purchased_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('branch_products')
        .select(
          'id, stock, piece_stock, price, avg_unit_cost, last_unit_cost, min_stock, product:products ( id, name, unit, sku, weigh_at_fulfillment )',
        )
        .eq('branch_id', tenant.branchId)
        .order('created_at', { ascending: true }),
      supabase
        .from('suppliers')
        .select('id, name, phone, notes, is_active, created_at')
        .eq('organization_id', tenant.organizationId)
        .order('name', { ascending: true }),
      supabase
        .from('expenses')
        .select('id, concept, amount, expense_date, notes, created_at')
        .eq('branch_id', tenant.branchId)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(500),
    ]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      purchases: purchases ?? [],
      products: products ?? [],
      suppliers: suppliers ?? [],
      expenses: expenses ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar compras' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'purchases.manage',
    'No tienes permiso para registrar compras',
  );
  if (denied) return denied;

  try {
    const tenant = await getDefaultTenant();
    const body = (await request.json()) as PurchaseInput;
    const validationError = validatePurchaseInput(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: supplier } = await supabase
      .from('suppliers')
      .select('id')
      .eq('id', body.supplierId)
      .eq('organization_id', tenant.organizationId)
      .eq('is_active', true)
      .maybeSingle();

    if (!supplier) {
      return NextResponse.json({ error: 'Proveedor no encontrado o inactivo' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('record_supplier_purchase', {
      p_branch_id: tenant.branchId,
      p_supplier_id: body.supplierId,
      p_purchased_at: body.purchasedAt ?? null,
      p_notes: body.notes ?? null,
      p_items: body.items.map((item) => ({
        branch_product_id: item.branchProductId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        quality: item.quality ?? 'normal',
        ...(item.pieceCount != null && item.pieceCount > 0
          ? { piece_count: item.pieceCount }
          : {}),
      })),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const row = data?.[0] as { purchase_id: string; total_amount: number } | undefined;
    return NextResponse.json({
      purchaseId: row?.purchase_id ?? null,
      totalAmount: row?.total_amount ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al registrar compra' },
      { status: 500 },
    );
  }
}
