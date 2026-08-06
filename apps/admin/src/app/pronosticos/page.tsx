import { createAdminClient } from '@puertaverde/supabase/admin';

import { AdminShell } from '@/components/AdminShell';
import { ForecastManager } from '@/components/ForecastManager';
import { getDefaultTenant } from '@/lib/tenant';
import type { ProductUnit } from '@puertaverde/shared';

export const dynamic = 'force-dynamic';

export default async function PronosticosPage() {
  const tenant = await getDefaultTenant();
  const supabase = createAdminClient();

  const { data: forecast } = await supabase.rpc('get_restock_forecast', {
    p_branch_id: tenant.branchId,
    p_horizon_days: 7,
  });

  return (
    <AdminShell title="Pronósticos" subtitle={`Reposición inteligente · ${tenant.branchName}`}>
      <ForecastManager
        initialForecast={(forecast ?? []) as Array<{
          branch_product_id: string;
          product_name: string;
          unit: ProductUnit;
          current_stock: number;
          avg_daily_sales: number;
          forecast_demand: number;
          suggested_reorder: number;
          days_until_stockout: number | null;
        }>}
      />
    </AdminShell>
  );
}
