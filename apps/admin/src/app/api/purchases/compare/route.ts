import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

interface CompareRow {
  branch_product_id: string;
  product_name: string;
  unit: string;
  supplier_id: string;
  supplier_name: string;
  purchase_count: number;
  total_quantity: number;
  avg_unit_price: number;
  min_unit_price: number;
  max_unit_price: number;
  last_unit_price: number;
  last_purchased_at: string;
}

export async function GET(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const { searchParams } = new URL(request.url);
    const branchProductId = searchParams.get('branchProductId');
    const days = Math.min(Math.max(Number(searchParams.get('days') ?? 90) || 90, 7), 365);

    const supabase = createAdminClient();
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceDate = since.toISOString().slice(0, 10);

    let query = supabase
      .from('purchase_items')
      .select(`
        quantity,
        unit_price,
        branch_product_id,
        branch_product:branch_products (
          id,
          product:products ( name, unit )
        ),
        purchase:purchases!inner (
          id,
          purchased_at,
          branch_id,
          supplier:suppliers ( id, name )
        )
      `)
      .eq('purchase.branch_id', tenant.branchId)
      .gte('purchase.purchased_at', sinceDate)
      .order('created_at', { ascending: false })
      .limit(2000);

    if (branchProductId) {
      query = query.eq('branch_product_id', branchProductId);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const groups = new Map<string, CompareRow & { _prices: number[]; _lastAt: string }>();

    for (const row of data ?? []) {
      const purchase = Array.isArray(row.purchase) ? row.purchase[0] : row.purchase;
      const supplier = purchase?.supplier
        ? Array.isArray(purchase.supplier)
          ? purchase.supplier[0]
          : purchase.supplier
        : null;
      const branchProduct = Array.isArray(row.branch_product)
        ? row.branch_product[0]
        : row.branch_product;
      const product = branchProduct?.product
        ? Array.isArray(branchProduct.product)
          ? branchProduct.product[0]
          : branchProduct.product
        : null;

      if (!purchase || !supplier || !product) continue;

      const key = `${row.branch_product_id}:${supplier.id}`;
      const existing = groups.get(key);
      const purchasedAt = purchase.purchased_at;
      const unitPrice = Number(row.unit_price);
      const quantity = Number(row.quantity);

      if (!existing) {
        groups.set(key, {
          branch_product_id: row.branch_product_id,
          product_name: product.name,
          unit: product.unit,
          supplier_id: supplier.id,
          supplier_name: supplier.name,
          purchase_count: 1,
          total_quantity: quantity,
          avg_unit_price: unitPrice,
          min_unit_price: unitPrice,
          max_unit_price: unitPrice,
          last_unit_price: unitPrice,
          last_purchased_at: purchasedAt,
          _prices: [unitPrice],
          _lastAt: purchasedAt,
        });
        continue;
      }

      existing.purchase_count += 1;
      existing.total_quantity += quantity;
      existing.min_unit_price = Math.min(existing.min_unit_price, unitPrice);
      existing.max_unit_price = Math.max(existing.max_unit_price, unitPrice);
      existing._prices.push(unitPrice);
      if (purchasedAt >= existing._lastAt) {
        existing._lastAt = purchasedAt;
        existing.last_purchased_at = purchasedAt;
        existing.last_unit_price = unitPrice;
      }
    }

    const comparison = [...groups.values()]
      .map(({ _prices, _lastAt: _ignored, ...row }) => ({
        ...row,
        avg_unit_price: Number(
          (_prices.reduce((sum, price) => sum + price, 0) / _prices.length).toFixed(2),
        ),
        total_quantity: Number(row.total_quantity.toFixed(3)),
      }))
      .sort((a, b) => {
        const byProduct = a.product_name.localeCompare(b.product_name, 'es');
        if (byProduct !== 0) return byProduct;
        return a.avg_unit_price - b.avg_unit_price;
      });

    return NextResponse.json({ days, comparison });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al comparar precios' },
      { status: 500 },
    );
  }
}
