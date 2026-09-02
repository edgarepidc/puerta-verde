import { createAdminClient } from '@puertaverde/supabase/admin';
import { redirect } from 'next/navigation';

import { AdminShell } from '@/components/AdminShell';
import { ForecastManager } from '@/components/ForecastManager';
import { LowStockThresholdsManager } from '@/components/LowStockThresholdsManager';
import { ProfitabilityManager } from '@/components/ProfitabilityManager';
import { getStaffSession, loadPermissionMatrix, staffHasPermission } from '@/lib/auth';
import { currentMexicoMonthRange, formatMexicoPeriodLabel } from '@/lib/mexico-date';
import { fetchMoneyPosition } from '@/lib/money-position';
import { fetchPeriodProfitExtras } from '@/lib/profit-extras';
import { getDefaultTenant } from '@/lib/tenant';
import type { OperatingCostPeriod, OperatingCostType, ProductUnit } from '@puertaverde/shared';

export const dynamic = 'force-dynamic';

export default async function NumerosPage() {
  const staff = await getStaffSession();
  if (!staff) redirect('/login');

  const tenant = await getDefaultTenant();
  const permissionMatrix = await loadPermissionMatrix(staff.organizationId);
  const canViewProfit = staffHasPermission(staff, 'profit.view', permissionMatrix);
  const canAdjustMoney = staffHasPermission(staff, 'profit.adjust_cash', permissionMatrix);
  const canEditStockThresholds = staffHasPermission(staff, 'stock.thresholds', permissionMatrix);
  const supabase = createAdminClient();
  const range = currentMexicoMonthRange();
  const periodLabel = formatMexicoPeriodLabel(range.start, range.end);

  const [
    { data: forecast },
    { data: stockProducts },
    { data: stockCategories },
    profitBundle,
    moneyPosition,
    profitExtras,
  ] = await Promise.all([
    supabase.rpc('get_restock_forecast', {
      p_branch_id: staff.branchId,
      p_horizon_days: 7,
    }),
    supabase
      .from('branch_products')
      .select(`
        id,
        stock,
        min_stock,
        is_available,
        product:products ( id, name, unit, sku )
      `)
      .eq('branch_id', staff.branchId)
      .order('created_at', { ascending: true }),
    supabase
      .from('product_categories')
      .select('id, name, sort_order, low_stock_threshold')
      .eq('organization_id', staff.organizationId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    canViewProfit
      ? Promise.all([
          supabase.rpc('get_product_margins', { p_branch_id: tenant.branchId }),
          supabase.from('branch_operating_costs').select('*, terms:branch_operating_cost_terms(id, start_date, end_date)').eq('branch_id', tenant.branchId).order('created_at'),
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
            .select('id, concept, amount, expense_date, notes, paid_from')
            .eq('branch_id', tenant.branchId)
            .gte('expense_date', range.start)
            .lte('expense_date', range.end)
            .order('expense_date', { ascending: false })
            .limit(200),
          supabase
            .from('income_entries')
            .select('id, entry_type, concept, amount, entry_date, notes')
            .eq('branch_id', tenant.branchId)
            .gte('entry_date', range.start)
            .lte('entry_date', range.end)
            .order('entry_date', { ascending: false })
            .limit(200),
          supabase
            .from('purchases')
            .select('total_amount')
            .eq('branch_id', tenant.branchId)
            .gte('purchased_at', range.start)
            .lte('purchased_at', range.end)
            .limit(2000),
        ])
      : Promise.resolve(null),
    canViewProfit
      ? fetchMoneyPosition(tenant.branchId, range.start, range.end).catch(() => null)
      : Promise.resolve(null),
    canViewProfit
      ? fetchPeriodProfitExtras(supabase, tenant.branchId, range.start, range.end).catch(() => ({
          wasteCost: 0,
          zeroCostSold: [],
        }))
      : Promise.resolve({ wasteCost: 0, zeroCostSold: [] as Array<{ name: string; revenue: number }> }),
  ]);

  const [margins, costs, summaryRows, categoryRows, visitExpenses, incomeEntries, purchaseRows] =
    profitBundle ?? [];

  const initialPurchasesTotal = (purchaseRows?.data ?? []).reduce(
    (sum, row) => sum + Number(row.total_amount ?? 0),
    0,
  );

  return (
    <AdminShell title="Números" subtitle={tenant.branchName}>
      <div className="space-y-6">
        {canViewProfit ? (
          <ProfitabilityManager
            initialFrom={range.start}
            initialTo={range.end}
            periodLabel={periodLabel}
            initialMargins={(margins?.data ?? []) as Array<{
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
            initialCosts={(costs?.data ?? []) as unknown as Array<{
              id: string;
              name: string;
              cost_type: OperatingCostType;
              period: OperatingCostPeriod;
              amount: number;
              notes: string | null;
              is_active: boolean;
              paid_from?: 'cash' | 'account' | null;
              charge_day?: number;
              terms?: Array<{ id: string; start_date: string; end_date: string | null }>;
            }>}
            initialVisitExpenses={(visitExpenses?.data ?? []) as Array<{
              id: string;
              concept: string;
              amount: number;
              expense_date: string;
              notes: string | null;
              paid_from?: 'cash' | 'account' | null;
            }>}
            initialIncomes={(incomeEntries?.data ?? []) as Array<{
              id: string;
              entry_type: 'contribution' | 'operating';
              concept: string;
              amount: number;
              entry_date: string;
              notes: string | null;
            }>}
            initialPurchasesTotal={Number(initialPurchasesTotal.toFixed(2))}
            initialWasteCost={Number(profitExtras.wasteCost ?? 0)}
            initialZeroCostSold={profitExtras.zeroCostSold ?? []}
            initialMoneyPosition={moneyPosition}
            canAdjustMoney={canAdjustMoney}
            initialSummary={(summaryRows?.data?.[0] as {
              period_days: number;
              revenue: number;
              cogs: number;
              gross_profit: number;
              gross_margin_percent: number;
              fixed_costs: number;
              variable_costs: number;
              visit_expenses: number;
              other_income: number;
              contributions: number;
              operating_costs_total: number;
              estimated_net_profit: number;
              order_count: number;
            }) ?? null}
            initialCategories={(categoryRows?.data ?? []) as Array<{
              category_name: string;
              product_count: number;
              units_sold: number;
              revenue: number;
              cogs: number;
              gross_profit: number;
              gross_margin_percent: number;
            }>}
          />
        ) : null}

        <ForecastManager
          stockProducts={(stockProducts ?? []) as Array<{
            id: string;
            stock: number;
            min_stock?: number | null;
            product: {
              name: string;
              unit?: ProductUnit;
              category?: { name?: string | null } | null;
            };
          }>}
          initialForecast={(forecast ?? []) as Array<{
            branch_product_id: string;
            product_name: string;
            unit: ProductUnit;
            current_stock: number;
            min_stock: number;
            avg_daily_sales: number;
            forecast_demand: number;
            suggested_reorder: number;
            days_until_stockout: number | null;
          }>}
        />
        <LowStockThresholdsManager
          canEdit={canEditStockThresholds}
          initialCategories={(stockCategories ?? []).map((row) => ({
            id: row.id,
            name: row.name,
            sort_order: row.sort_order,
            low_stock_threshold: Number(row.low_stock_threshold ?? 3),
          }))}
        />
      </div>
    </AdminShell>
  );
}
