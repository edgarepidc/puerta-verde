import { AdminShell } from '@/components/AdminShell';
import { CashClosingManager } from '@/components/CashClosingManager';
import { getStaffSession } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function CajaPage() {
  const staff = await getStaffSession();
  if (!staff) redirect('/login');

  return (
    <AdminShell title="Caja" subtitle={`${staff.branchName} · Pagos del día`}>
      <CashClosingManager />
    </AdminShell>
  );
}
