import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

import { formatMoney } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';

export async function GET(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(Number(searchParams.get('days') ?? 30), 1), 365);

  const supabase = createAdminClient();
  const [{ data: summaryRows }, { data: categoryRows }, { data: margins }] = await Promise.all([
    supabase.rpc('get_profit_summary', { p_branch_id: auth.branchId, p_days: days }),
    supabase.rpc('get_profit_by_category', { p_branch_id: auth.branchId, p_days: days }),
    supabase.rpc('get_product_margins', { p_branch_id: auth.branchId }),
  ]);

  const summary = summaryRows?.[0] as {
    period_days: number;
    revenue: number;
    cogs: number;
    gross_profit: number;
    gross_margin_percent: number;
    fixed_costs: number;
    variable_costs: number;
    operating_costs_total: number;
    estimated_net_profit: number;
    order_count: number;
  } | undefined;

  const workbook = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ['Reporte de utilidades', auth.branchName],
    ['Periodo (días)', days],
    ['Generado', new Date().toLocaleString('es-MX')],
    [],
    ['Métrica', 'Valor'],
    ['Pedidos', summary?.order_count ?? 0],
    ['Ventas', summary?.revenue ?? 0],
    ['Costo de mercancía', summary?.cogs ?? 0],
    ['Utilidad bruta', summary?.gross_profit ?? 0],
    ['Margen bruto %', summary?.gross_margin_percent ?? 0],
    ['Costos fijos', summary?.fixed_costs ?? 0],
    ['Costos variables', summary?.variable_costs ?? 0],
    ['Costos operativos', summary?.operating_costs_total ?? 0],
    ['Utilidad estimada', summary?.estimated_net_profit ?? 0],
  ]);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');

  const categorySheet = XLSX.utils.json_to_sheet(
    (categoryRows ?? []).map((row: {
      category_name: string;
      product_count: number;
      units_sold: number;
      revenue: number;
      cogs: number;
      gross_profit: number;
      gross_margin_percent: number;
    }) => ({
      Categoría: row.category_name,
      Productos: row.product_count,
      'Unidades vendidas': row.units_sold,
      Ventas: row.revenue,
      COGS: row.cogs,
      'Utilidad bruta': row.gross_profit,
      'Margen %': row.gross_margin_percent,
    })),
  );
  XLSX.utils.book_append_sheet(workbook, categorySheet, 'Por categoría');

  const marginsSheet = XLSX.utils.json_to_sheet(
    (margins ?? []).map((row: {
      product_name: string;
      unit: string;
      sale_price: number;
      avg_unit_cost: number;
      last_unit_cost: number | null;
      margin_amount: number;
      margin_percent: number;
      stock: number;
      inventory_value_cost: number;
      inventory_value_sale: number;
    }) => ({
      Producto: row.product_name,
      Unidad: row.unit,
      'Precio venta': row.sale_price,
      'Costo promedio': row.avg_unit_cost,
      'Último costo': row.last_unit_cost,
      'Margen $': row.margin_amount,
      'Margen %': row.margin_percent,
      Stock: row.stock,
      'Valor inventario (costo)': row.inventory_value_cost,
      'Valor inventario (venta)': row.inventory_value_sale,
    })),
  );
  XLSX.utils.book_append_sheet(workbook, marginsSheet, 'Márgenes');

  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const filename = `utilidades-${auth.branchSlug}-${days}d.xlsx`;

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
