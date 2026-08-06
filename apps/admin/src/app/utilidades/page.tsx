import { createAdminClient } from '@puertaverde/supabase/admin';

import { AdminShell } from '@/components/AdminShell';
import { ProfitabilityManager } from '@/components/ProfitabilityManager';
import { getDefaultTenant } from '@/lib/tenant';
import type { OperatingCostPeriod, OperatingCostType, ProductUnit } from '@puertaverde/shared';

export const dynamic = 'force-dynamic';

export default async function UtilidadesPage() {
  const tenant = await getDefaultTenant();
  const supabase = createAdminClient();

  const [{ data: margins }, { data: costs }, { data: summaryRows }] = await Promise.all([
    supabase.rpc('get_product_margins', { p_branch_id: tenant.branchId }),
    supabase.from('branch_operating_costs').select('*').eq('branch_id', tenant.branchId).order('created_at'),
    supabase.rpc('get_profit_summary', { p_branch_id: tenant.branchId, p_days: 30 }),
  ]);

  return (
    <AdminShell title="Utilidades" subtitle={`Márgenes y costos · ${tenant.branchName}`}>
      <ProfitabilityManager
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
        initialSummary={(summaryRows?.[0] as {
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
        }) ?? null}
      />
    </AdminShell>
  );
}
