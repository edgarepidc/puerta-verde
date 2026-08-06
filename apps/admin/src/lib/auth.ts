import { NextResponse } from 'next/server';

import {
  STAFF_ROLES,
  type StaffRole,
} from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getDefaultTenant, resolveTenantForUser, type TenantContext } from '@/lib/tenant';

export interface StaffContext extends TenantContext {
  userId: string;
  email: string;
  fullName: string | null;
  role: StaffRole;
  isPlatformAdmin: boolean;
}

export async function getStaffSession(): Promise<StaffContext | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, is_platform_admin')
    .eq('id', user.id)
    .maybeSingle();

  const isPlatformAdmin = Boolean(profile?.is_platform_admin);
  const tenant = (await resolveTenantForUser(user.id)) ?? (isPlatformAdmin ? await getDefaultTenant() : null);
  if (!tenant) return null;

  const { data: membership } = await admin
    .from('staff_memberships')
    .select('role, status')
    .eq('user_id', user.id)
    .eq('organization_id', tenant.organizationId)
    .eq('status', 'active')
    .maybeSingle();

  if (!membership || !STAFF_ROLES.includes(membership.role as StaffRole)) {
    if (!isPlatformAdmin) return null;
  }

  return {
    ...tenant,
    userId: user.id,
    email: user.email,
    fullName: profile?.full_name ?? null,
    role: (membership?.role as StaffRole) ?? 'owner',
    isPlatformAdmin,
  };
}

export async function requireStaff(): Promise<StaffContext> {
  const session = await getStaffSession();
  if (!session) {
    throw new Error('No autorizado');
  }
  return session;
}

export async function requireStaffApi(): Promise<StaffContext | NextResponse> {
  try {
    return await requireStaff();
  } catch {
    return NextResponse.json({ error: 'Sesión inválida o sin permisos' }, { status: 401 });
  }
}

export async function requirePlatformAdmin(): Promise<StaffContext> {
  const session = await requireStaff();
  if (!session.isPlatformAdmin) {
    throw new Error('Sin acceso de plataforma');
  }
  return session;
}

export async function requirePlatformAdminApi(): Promise<StaffContext | NextResponse> {
  try {
    return await requirePlatformAdmin();
  } catch {
    return NextResponse.json({ error: 'Solo el super admin puede hacer esto' }, { status: 403 });
  }
}

export function canManageStaff(role: StaffRole): boolean {
  return role === 'owner' || role === 'org_admin';
}
