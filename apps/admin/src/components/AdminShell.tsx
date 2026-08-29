import Link from 'next/link';
import { redirect } from 'next/navigation';

import { BrandLogo } from '@/components/BrandLogo';
import { AdminNav } from '@/components/AdminNav';
import { BranchSwitcher } from '@/components/BranchSwitcher';
import { LogoutButton } from '@/components/LogoutButton';
import { getStaffSession } from '@/lib/auth';
import { mexicoDayGreeting } from '@/lib/mexico-date';
import { listBranchesForUser } from '@/lib/tenant';
import { createAdminClient } from '@puertaverde/supabase/admin';
import { STATUS_LABELS, isSubscriptionUsable } from '@puertaverde/shared';

function StorefrontIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 10.5 4.8 5.2A2 2 0 0 1 6.7 4h10.6a2 2 0 0 1 1.9 1.2L21 10.5" />
      <path d="M4 10.5h16v8.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" />
      <path d="M9 20.5v-5h6v5" />
      <path d="M7 10.5V8M12 10.5V8M17 10.5V8" />
    </svg>
  );
}

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

  const displayName =
    staff.fullName?.trim() || staff.email.split('@')[0] || 'equipo';
  const greeting = `${mexicoDayGreeting()} - ${displayName}`;

  return (
    <>
      <div className="pv-ambient pv-ambient--admin" aria-hidden />
      <main className="relative flex min-h-screen flex-col">
        <header className="pv-glass-header relative z-40">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-3 py-2 sm:px-4 md:gap-4">
            <div className="flex shrink-0 items-center gap-2">
              <BrandLogo href="/" imageClassName="h-12 w-auto sm:h-14 md:h-16" priority />
              <BranchSwitcher branches={branches} currentBranchId={staff.branchId} />
            </div>
            <p className="min-w-0 flex-1 truncate text-lg font-semibold leading-tight text-slate-900 sm:text-xl">
              {greeting}
            </p>
            <AdminNav isPlatformAdmin={staff.isPlatformAdmin} />
          </div>
        </header>

        <div className="mx-auto w-full max-w-5xl flex-1 px-3 py-3 sm:px-4 sm:py-6">
          {!subscriptionOk && org && (
            <div className="pv-callout--amber mb-4 p-3 text-sm sm:mb-6 sm:p-4">
              Tu suscripción está en estado <strong>{STATUS_LABELS[org.subscription_status]}</strong>.
              Actualiza tu plan en{' '}
              <Link href="/configuracion?tab=suscripcion" className="font-medium underline">
                Ajustes
              </Link>{' '}
              para seguir operando sin interrupciones.
            </div>
          )}
          {children}
        </div>

        <footer className="pv-glass-header mt-auto border-t border-slate-200/70">
          <div className="mx-auto flex max-w-5xl items-center justify-end gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
            <Link
              href={`${storeUrl}/${staff.branchSlug}`}
              className="pv-btn-secondary inline-flex items-center gap-2 px-3 py-2 text-sm sm:px-4"
            >
              <StorefrontIcon />
              <span className="sm:hidden">Tienda</span>
              <span className="hidden sm:inline">Ver tienda</span>
            </Link>
            <LogoutButton />
          </div>
        </footer>
      </main>
    </>
  );
}
