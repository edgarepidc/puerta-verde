/** Active staff roles in the admin panel (3 perfiles). */
export const STAFF_ROLES = ['owner', 'branch_manager', 'staff'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Legacy DB enum value — mapped to branch_manager. */
export const LEGACY_STAFF_ROLES = ['org_admin'] as const;

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  owner: 'Propietario',
  branch_manager: 'Administrador',
  staff: 'Personal',
};

/** Map DB / stored role strings onto the active 3-role model. */
export function normalizeStaffRole(role: string | null | undefined): StaffRole | null {
  if (role === 'org_admin') return 'branch_manager';
  if (role === 'owner' || role === 'branch_manager' || role === 'staff') return role;
  return null;
}

export function isStaffRole(value: string): value is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(value);
}
