import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { AdminShell } from '@/components/AdminShell';
import { BillingManager } from '@/components/BillingManager';
import { ConfiguracionTabs } from '@/components/ConfiguracionTabs';
import { PermissionsManager } from '@/components/PermissionsManager';
import { PlatformManager } from '@/components/PlatformManager';
import { SettingsManager } from '@/components/SettingsManager';
import { WhatsAppInbox } from '@/components/WhatsAppInbox';
import {
  canEditPermissions,
  getStaffSession,
  loadPermissionMatrix,
  staffHasPermission,
} from '@/lib/auth';
import { parseBranchSettingsFlags } from '@/lib/branch-settings';
import { getDefaultTenant } from '@/lib/tenant';
import { normalizeStaffRole, type StaffRole } from '@puertaverde/shared';

export const dynamic = 'force-dynamic';

export default async function ConfiguracionPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  if (params.tab === 'cupones') redirect('/promociones?section=cupones');
  if (params.tab === 'stock') redirect('/?section=stock');

  const staff = await getStaffSession();
  const tenant = await getDefaultTenant();
  const supabase = createAdminClient();
  const isPlatformAdmin = Boolean(staff?.isPlatformAdmin);
  const permissionMatrix = await loadPermissionMatrix(tenant.organizationId);
  const canManageUsers = staff
    ? staffHasPermission(staff, 'staff.manage', permissionMatrix)
    : false;
  const canEditBranch = staff
    ? staffHasPermission(staff, 'branch.settings', permissionMatrix)
    : false;
  const canEditPerms = staff ? canEditPermissions(staff) : false;

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
      .select(
        'id, name, slug, address, pickup_instructions, delivery_fee, minimum_order_amount, whatsapp_phone, opening_hours, fulfillment_mode, settings',
      )
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
  const staffRows = (memberships ?? []).flatMap((row) => {
    const role = normalizeStaffRole(row.role);
    if (!role) return [];
    const profile = profileById.get(row.user_id);
    return [
      {
        ...row,
        role: role as StaffRole,
        full_name: profile?.full_name ?? null,
        phone: profile?.phone ?? null,
      },
    ];
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
      <Suspense fallback={<p className="text-sm text-slate-500">Cargando configuración…</p>}>
        <ConfiguracionTabs
          isPlatformAdmin={isPlatformAdmin}
          suscripcion={
            <BillingManager
              organization={organization!}
              canManage={canManageUsers}
            />
          }
          sucursal={
            <SettingsManager
              section="branch"
              initialBranch={{
                ...branch!,
                usb_scale_enabled: parseBranchSettingsFlags(branch?.settings).usbScaleEnabled,
              }}
              initialStaff={staffRows}
              canManage={canEditBranch}
              currentUserId={staff?.userId ?? ''}
            />
          }
          equipo={
            <div className="space-y-8">
              <SettingsManager
                section="staff"
                initialBranch={branch!}
                initialStaff={staffRows}
                canManage={canManageUsers}
                currentUserId={staff?.userId ?? ''}
              />
              <PermissionsManager
                initialMatrix={permissionMatrix}
                canEdit={canEditPerms}
              />
            </div>
          }
          whatsapp={
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
          }
          plataforma={
            isPlatformAdmin ? (
              <section className="space-y-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Plataforma</h2>
                  <p className="text-sm text-slate-500">
                    Alta de verdulerías y sucursales.
                  </p>
                </div>
                <PlatformManager initialOrganizations={orgsWithBranches} />
              </section>
            ) : null
          }
        />
      </Suspense>
    </AdminShell>
  );
}
