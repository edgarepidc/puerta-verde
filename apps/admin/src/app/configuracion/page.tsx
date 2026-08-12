import { createAdminClient } from '@puertaverde/supabase/admin';

import { AdminShell } from '@/components/AdminShell';
import { BillingManager } from '@/components/BillingManager';
import { PlatformManager } from '@/components/PlatformManager';
import { SettingsManager } from '@/components/SettingsManager';
import { WhatsAppInbox } from '@/components/WhatsAppInbox';
import { canManageStaff, getStaffSession } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export default async function ConfiguracionPage() {
  const staff = await getStaffSession();
  const tenant = await getDefaultTenant();
  const supabase = createAdminClient();
  const isPlatformAdmin = Boolean(staff?.isPlatformAdmin);

  const [
    { data: branch },
    { data: organization },
    { data: memberships },
    { data: whatsappMessages },
    platformOrgsResult,
    platformBranchesResult,
  ] = await Promise.all([
    supabase
      .from('branches')
      .select('id, name, slug, address, pickup_instructions, delivery_fee, minimum_order_amount, whatsapp_phone, opening_hours, fulfillment_mode')
      .eq('id', tenant.branchId)
      .single(),
    supabase
      .from('organizations')
      .select('name, subscription_plan, subscription_status, trial_ends_at, stripe_customer_id')
      .eq('id', tenant.organizationId)
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
    isPlatformAdmin
      ? supabase
          .from('organizations')
          .select('id, name, slug, subscription_plan, subscription_status, created_at')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: null }),
    isPlatformAdmin
      ? supabase.from('branches').select('id, name, slug, is_active, organization_id').order('name')
      : Promise.resolve({ data: null }),
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

  const orgsWithBranches = isPlatformAdmin
    ? (platformOrgsResult.data ?? []).map((org) => ({
        ...org,
        branches: (platformBranchesResult.data ?? []).filter(
          (branchRow) => branchRow.organization_id === org.id,
        ),
      }))
    : [];

  return (
    <AdminShell title="Configuración" subtitle={tenant.branchName}>
      <div className="space-y-8">
        <BillingManager
          organization={organization!}
          canManage={staff ? canManageStaff(staff.role) : false}
        />
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
        {isPlatformAdmin && (
          <section id="plataforma" className="scroll-mt-28 space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Plataforma</h2>
              <p className="text-sm text-slate-500">
                Solo visible para super admin. Alta de verdulerías y sucursales.
              </p>
            </div>
            <PlatformManager initialOrganizations={orgsWithBranches} />
          </section>
        )}
      </div>
    </AdminShell>
  );
}
