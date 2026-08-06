import Link from 'next/link';
import { redirect } from 'next/navigation';

import { BrandLogo } from '@/components/BrandLogo';
import { AdminNav } from '@/components/AdminNav';
import { BranchSwitcher } from '@/components/BranchSwitcher';
import { LogoutButton } from '@/components/LogoutButton';
import { getStaffSession } from '@/lib/auth';
import { listBranchesForUser } from '@/lib/tenant';
import { createAdminClient } from '@puertaverde/supabase/admin';
import { STATUS_LABELS, isSubscriptionUsable } from '@puertaverde/shared';

export async function AdminShell({
  title: _title,
  subtitle: _subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const staff = await getStaffSession();
  if (!staff) {
    redirect('/login');
  }

  const storeUrl =
    process.env.NEXT_PUBLIC_WEB_URL ?? 'https://puerta-verde-web.vercel.app';

  const [branches, orgResult] = await Promise.all([
    listBranchesForUser(staff.userId),
    createAdminClient()
      .from('organizations')
      .select('subscription_status, subscription_plan, trial_ends_at')
      .eq('id', staff.organizationId)
      .single(),
  ]);

  const org = orgResult.data;
  const subscriptionOk = org
    ? isSubscriptionUsable(org.subscription_status, org.trial_ends_at)
    : true;

  return (
    <>
      <div className="pv-ambient pv-ambient--admin" aria-hidden />
      <main className="relative min-h-screen">
        <header className="pv-glass-header sticky top-0 z-40">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
            <BrandLogo href="/" imageClassName="h-16 w-auto sm:h-20" />
            <div className="flex flex-wrap items-center gap-3">
              <BranchSwitcher branches={branches} currentBranchId={staff.branchId} />
              <AdminNav isPlatformAdmin={staff.isPlatformAdmin} />
              <span className="hidden text-sm text-slate-500 sm:inline">
                {staff.fullName ?? staff.email}
              </span>
              <Link
                href={`${storeUrl}/${staff.branchSlug}`}
                className="pv-btn-secondary px-4 py-2 text-sm"
              >
                Ver tienda
              </Link>
              <LogoutButton />
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-6 py-8">
          {!subscriptionOk && org && (
            <div className="pv-callout--amber mb-6 p-4 text-sm">
              Tu suscripción está en estado <strong>{STATUS_LABELS[org.subscription_status]}</strong>.
              Actualiza tu plan en{' '}
              <Link href="/configuracion" className="font-medium underline">
                Configuración
              </Link>{' '}
              para seguir operando sin interrupciones.
            </div>
          )}
          {children}
        </div>
      </main>
    </>
  );
}
