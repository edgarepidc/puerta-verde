import { createAdminClient } from '@puertaverde/supabase/admin';

import { AdminShell } from '@/components/AdminShell';
import { SettingsManager } from '@/components/SettingsManager';
import { WhatsAppInbox } from '@/components/WhatsAppInbox';
import { canManageStaff, getStaffSession } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export default async function ConfiguracionPage() {
  const staff = await getStaffSession();
  const tenant = await getDefaultTenant();
  const supabase = createAdminClient();

  const [{ data: branch }, { data: memberships }, { data: whatsappMessages }] = await Promise.all([
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
    supabase
      .from('whatsapp_message_logs')
      .select('id, direction, recipient_phone, template_key, body, status, created_at')
      .eq('organization_id', tenant.organizationId)
      .order('created_at', { ascending: false })
      .limit(30),
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
      <div className="space-y-8">
        <SettingsManager
          initialBranch={branch!}
          initialStaff={staffRows}
          canManage={staff ? canManageStaff(staff.role) : false}
          currentUserId={staff?.userId ?? ''}
        />
        <WhatsAppInbox
          initialMessages={(whatsappMessages ?? []) as Array<{
            id: string;
            direction: 'inbound' | 'outbound';
            recipient_phone: string;
            template_key: string | null;
            body: string;
            status: string;
            created_at: string;
          }>}
        />
      </div>
    </AdminShell>
  );
}
