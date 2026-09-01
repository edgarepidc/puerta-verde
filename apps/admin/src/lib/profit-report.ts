import { formatMoney } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { resolveProfitDateRange } from '@/lib/mexico-date';

export interface ProfitReportData {
  summary: {
    period_days: number;
    revenue: number;
    cogs: number;
    gross_profit: number;
    gross_margin_percent: number;
    fixed_costs: number;
    variable_costs: number;
    visit_expenses: number;
    other_income?: number;
    contributions?: number;
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
  periodLabel: string;
  from: string;
  to: string;
}

export async function fetchProfitReport(
  branchId: string,
  from?: string | null,
  to?: string | null,
): Promise<ProfitReportData> {
  const range = resolveProfitDateRange(from, to);
  if (!range.ok) {
    throw new Error(range.error);
  }

  const supabase = createAdminClient();
  const [{ data: summaryRows }, { data: categoryRows }, { data: margins }] = await Promise.all([
    supabase.rpc('get_profit_summary', {
      p_branch_id: branchId,
      p_start: range.start,
      p_end: range.end,
    }),
    supabase.rpc('get_profit_by_category', {
      p_branch_id: branchId,
      p_start: range.start,
      p_end: range.end,
    }),
    supabase.rpc('get_product_margins', { p_branch_id: branchId }),
  ]);

  return {
    summary: (summaryRows?.[0] as ProfitReportData['summary']) ?? null,
    categories: (categoryRows ?? []) as ProfitReportData['categories'],
    margins: (margins ?? []) as ProfitReportData['margins'],
    periodLabel: range.label,
    from: range.start,
    to: range.end,
  };
}

export function profitSummaryLines(
  summary: ProfitReportData['summary'],
  branchName: string,
  periodLabel: string,
): string[] {
  return [
    `Reporte de utilidades — ${branchName}`,
    `Periodo: ${periodLabel}`,
    `Generado: ${new Date().toLocaleString('es-MX')}`,
    '',
    `Pedidos: ${summary?.order_count ?? 0}`,
    `Ventas: ${formatMoney(summary?.revenue ?? 0)}`,
    `Costo de lo vendido: ${formatMoney(summary?.cogs ?? 0)}`,
    `Utilidad bruta: ${formatMoney(summary?.gross_profit ?? 0)}`,
    `Margen bruto: ${summary?.gross_margin_percent ?? 0}%`,
    `Costos operativos: ${formatMoney(summary?.operating_costs_total ?? 0)}`,
    `Gastos de visita: ${formatMoney(summary?.visit_expenses ?? 0)}`,
    `Otros ingresos: ${formatMoney(summary?.other_income ?? 0)}`,
    `Aportaciones: ${formatMoney(summary?.contributions ?? 0)}`,
    `Utilidad estimada: ${formatMoney(summary?.estimated_net_profit ?? 0)}`,
  ];
}
