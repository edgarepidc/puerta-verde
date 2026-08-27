import { NextResponse } from 'next/server';

import {
  canEditPermissionMatrix,
  normalizeStaffRole,
  parsePermissionsFromOrgSettings,
  roleHasPermission,
  type PermissionKey,
  type PermissionMatrix,
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

  const normalizedRole = normalizeStaffRole(membership?.role ?? null);
  if (!membership || !normalizedRole) {
    if (!isPlatformAdmin) return null;
  }

  return {
    ...tenant,
    userId: user.id,
    email: user.email,
    fullName: profile?.full_name ?? null,
    role: normalizedRole ?? 'owner',
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

export function canEditPermissions(staff: Pick<StaffContext, 'role' | 'isPlatformAdmin'>): boolean {
  return staff.isPlatformAdmin || canEditPermissionMatrix(staff.role);
}

export async function loadPermissionMatrix(organizationId: string): Promise<PermissionMatrix> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', organizationId)
    .maybeSingle();
  return parsePermissionsFromOrgSettings(data?.settings ?? {});
}

export function staffHasPermission(
  staff: Pick<StaffContext, 'role' | 'isPlatformAdmin'>,
  key: PermissionKey,
  matrix: PermissionMatrix,
): boolean {
  if (staff.isPlatformAdmin) return true;
  return roleHasPermission(staff.role, key, matrix);
}

/** Loads org matrix and returns 403 if the staff lacks the permission. */
export async function requireStaffPermission(
  staff: Pick<StaffContext, 'organizationId' | 'role' | 'isPlatformAdmin'>,
  key: PermissionKey,
  message?: string,
): Promise<NextResponse | null> {
  const matrix = await loadPermissionMatrix(staff.organizationId);
  if (!staffHasPermission(staff, key, matrix)) {
    return forbiddenPermissionResponse(message);
  }
  return null;
}

/** @deprecated Prefer staffHasPermission with matrix — kept for gradual migration. */
export function canManageStaff(role: StaffRole): boolean {
  return role === 'owner' || role === 'branch_manager';
}

/** @deprecated Prefer staffHasPermission('pos.edit_price'). */
export function canOverridePosPrice(role: StaffRole): boolean {
  return role === 'owner' || role === 'branch_manager';
}

export function forbiddenPermissionResponse(message = 'No tienes permiso para esta acción') {
  return NextResponse.json({ error: message }, { status: 403 });
}
