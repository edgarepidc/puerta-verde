import { AdminShell } from '@/components/AdminShell';
import { CashClosingManager } from '@/components/CashClosingManager';
import { getStaffSession, loadPermissionMatrix, staffHasPermission } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function CajaPage() {
  const staff = await getStaffSession();
  if (!staff) redirect('/login');

  const permissionMatrix = await loadPermissionMatrix(staff.organizationId);
  const canManage = staffHasPermission(staff, 'cash.closing', permissionMatrix);

  return (
    <AdminShell title="Caja" subtitle={`${staff.branchName} · Pagos del día`}>
      <CashClosingManager canManage={canManage} />
    </AdminShell>
  );
}
