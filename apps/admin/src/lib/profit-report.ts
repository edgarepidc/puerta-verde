import { formatMoney } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

export interface ProfitReportData {
  summary: {
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
  } | null;
  categories: Array<{
    category_name: string;
    product_count: number;
    units_sold: number;
    revenue: number;
    cogs: number;
    gross_profit: number;
    gross_margin_percent: number;
  }>;
  margins: Array<{
    product_name: string;
    unit: string;
    sale_price: number;
    avg_unit_cost: number;
    last_unit_cost: number | null;
    margin_amount: number;
    margin_percent: number;
    stock: number;
  }>;
}

export async function fetchProfitReport(branchId: string, days: number): Promise<ProfitReportData> {
  const supabase = createAdminClient();
  const [{ data: summaryRows }, { data: categoryRows }, { data: margins }] = await Promise.all([
    supabase.rpc('get_profit_summary', { p_branch_id: branchId, p_days: days }),
    supabase.rpc('get_profit_by_category', { p_branch_id: branchId, p_days: days }),
    supabase.rpc('get_product_margins', { p_branch_id: branchId }),
  ]);

  return {
    summary: (summaryRows?.[0] as ProfitReportData['summary']) ?? null,
    categories: (categoryRows ?? []) as ProfitReportData['categories'],
    margins: (margins ?? []) as ProfitReportData['margins'],
  };
}

export function profitSummaryLines(summary: ProfitReportData['summary'], branchName: string, days: number): string[] {
  return [
    `Reporte de utilidades — ${branchName}`,
    `Periodo: ${days} días`,
    `Generado: ${new Date().toLocaleString('es-MX')}`,
    '',
    `Pedidos: ${summary?.order_count ?? 0}`,
    `Ventas: ${formatMoney(summary?.revenue ?? 0)}`,
    `Costo de mercancía: ${formatMoney(summary?.cogs ?? 0)}`,
    `Utilidad bruta: ${formatMoney(summary?.gross_profit ?? 0)}`,
    `Margen bruto: ${summary?.gross_margin_percent ?? 0}%`,
    `Costos operativos: ${formatMoney(summary?.operating_costs_total ?? 0)}`,
    `Utilidad estimada: ${formatMoney(summary?.estimated_net_profit ?? 0)}`,
  ];
}
