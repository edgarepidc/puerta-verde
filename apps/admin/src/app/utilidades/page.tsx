import { createAdminClient } from '@puertaverde/supabase/admin';
import { redirect } from 'next/navigation';

import { AdminShell } from '@/components/AdminShell';
import { ProfitabilityManager } from '@/components/ProfitabilityManager';
import { getStaffSession, loadPermissionMatrix, staffHasPermission } from '@/lib/auth';
import { currentMexicoMonthRange, formatMexicoPeriodLabel } from '@/lib/mexico-date';
import { getDefaultTenant } from '@/lib/tenant';
import type { OperatingCostPeriod, OperatingCostType, ProductUnit } from '@puertaverde/shared';

export const dynamic = 'force-dynamic';

export default async function UtilidadesPage() {
  const staff = await getStaffSession();
  if (!staff) redirect('/login');

  const tenant = await getDefaultTenant();
  const permissionMatrix = await loadPermissionMatrix(staff.organizationId);
  const canView = staffHasPermission(staff, 'profit.view', permissionMatrix);

  if (!canView) {
    return (
      <AdminShell title="Utilidades" subtitle={`Márgenes y costos · ${tenant.branchName}`}>
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No tienes permiso para ver utilidades y márgenes.
        </p>
      </AdminShell>
    );
  }

  const supabase = createAdminClient();
  const range = currentMexicoMonthRange();
  const periodLabel = formatMexicoPeriodLabel(range.start, range.end);

  const [{ data: margins }, { data: costs }, { data: summaryRows }, { data: categoryRows }, { data: visitExpenses }] =
    await Promise.all([
      supabase.rpc('get_product_margins', { p_branch_id: tenant.branchId }),
      supabase.from('branch_operating_costs').select('*').eq('branch_id', tenant.branchId).order('created_at'),
      supabase.rpc('get_profit_summary', {
        p_branch_id: tenant.branchId,
        p_start: range.start,
        p_end: range.end,
      }),
      supabase.rpc('get_profit_by_category', {
        p_branch_id: tenant.branchId,
        p_start: range.start,
        p_end: range.end,
      }),
      supabase
        .from('expenses')
        .select('id, concept, amount, expense_date, notes')
        .eq('branch_id', tenant.branchId)
        .gte('expense_date', range.start)
        .lte('expense_date', range.end)
        .order('expense_date', { ascending: false })
        .limit(200),
    ]);

  return (
    <AdminShell title="Utilidades" subtitle={`Márgenes y costos · ${tenant.branchName}`}>
      <ProfitabilityManager
        initialFrom={range.start}
        initialTo={range.end}
        periodLabel={periodLabel}
        initialMargins={(margins ?? []) as Array<{
          branch_product_id: string;
          product_name: string;
          unit: ProductUnit;
          sale_price: number;
          avg_unit_cost: number;
          last_unit_cost: number | null;
          margin_amount: number;
          margin_percent: number;
          stock: number;
          inventory_value_cost: number;
          inventory_value_sale: number;
        }>}
        initialCosts={(costs ?? []) as Array<{
          id: string;
          name: string;
          cost_type: OperatingCostType;
          period: OperatingCostPeriod;
          amount: number;
          notes: string | null;
          is_active: boolean;
        }>}
        initialVisitExpenses={(visitExpenses ?? []) as Array<{
          id: string;
          concept: string;
          amount: number;
          expense_date: string;
          notes: string | null;
        }>}
        initialSummary={(summaryRows?.[0] as {
          period_days: number;
          revenue: number;
          cogs: number;
          gross_profit: number;
          gross_margin_percent: number;
          fixed_costs: number;
          variable_costs: number;
          visit_expenses: number;
          operating_costs_total: number;
          estimated_net_profit: number;
          order_count: number;
        }) ?? null}
        initialCategories={(categoryRows ?? []) as Array<{
          category_name: string;
          product_count: number;
          units_sold: number;
          revenue: number;
          cogs: number;
          gross_profit: number;
          gross_margin_percent: number;
        }>}
      />
    </AdminShell>
  );
}
