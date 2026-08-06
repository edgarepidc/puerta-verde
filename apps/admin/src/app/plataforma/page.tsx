import { redirect } from 'next/navigation';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { AdminShell } from '@/components/AdminShell';
import { PlatformManager } from '@/components/PlatformManager';
import { getStaffSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function PlataformaPage() {
  const staff = await getStaffSession();
  if (!staff) redirect('/login');
  if (!staff.isPlatformAdmin) redirect('/');

  const supabase = createAdminClient();
  const [{ data: organizations }, { data: branches }] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, name, slug, subscription_plan, subscription_status, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('branches').select('id, name, slug, is_active, organization_id').order('name'),
  ]);

  const orgsWithBranches = (organizations ?? []).map((org) => ({
    ...org,
    branches: (branches ?? []).filter((branch) => branch.organization_id === org.id),
  }));

  return (
    <AdminShell title="Plataforma" subtitle="Super admin · verdulerías">
      <PlatformManager initialOrganizations={orgsWithBranches} />
    </AdminShell>
  );
}
