import { createAdminClient } from '@puertaverde/supabase/admin';

import { AdminShell } from '@/components/AdminShell';
import { SettingsManager } from '@/components/SettingsManager';
import { canManageStaff, getStaffSession } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export default async function ConfiguracionPage() {
  const staff = await getStaffSession();
  const tenant = await getDefaultTenant();
  const supabase = createAdminClient();

  const [{ data: branch }, { data: memberships }] = await Promise.all([
    supabase
      .from('branches')
      .select('id, name, slug, address, pickup_instructions, delivery_fee, minimum_order_amount')
      .eq('id', tenant.branchId)
      .single(),
    supabase
      .from('staff_memberships')
      .select('id, user_id, role, status, branch_id, created_at')
      .eq('organization_id', tenant.organizationId)
      .order('created_at', { ascending: true }),
  ]);

  const userIds = (memberships ?? []).map((row) => row.user_id);
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, full_name, phone').in('id', userIds)
    : { data: [] };

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const staffRows = (memberships ?? []).map((row) => {
    const profile = profileById.get(row.user_id);
    return {
      ...row,
      full_name: profile?.full_name ?? null,
      phone: profile?.phone ?? null,
    };
  });

  return (
    <AdminShell title="Configuración" subtitle={tenant.branchName}>
      <SettingsManager
        initialBranch={branch!}
        initialStaff={staffRows}
        canManage={staff ? canManageStaff(staff.role) : false}
        currentUserId={staff?.userId ?? ''}
      />
    </AdminShell>
  );
}
