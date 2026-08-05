import Link from 'next/link';

import { BrandLogo } from '@/components/BrandLogo';
import { AdminNav } from '@/components/AdminNav';

export function AdminShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const storeUrl =
    process.env.NEXT_PUBLIC_WEB_URL ?? 'https://puerta-verde-web.vercel.app';

  return (
    <main className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <BrandLogo href="/" imageClassName="h-12 w-auto" />
            <div>
              <h1 className="text-xl font-bold text-slate-900">{title}</h1>
              {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <AdminNav />
            <Link
              href={`${storeUrl}/puerta-verde-demo`}
              className="rounded-full border border-green-200 px-4 py-2 text-sm font-medium text-[var(--pv-green-800)]"
            >
              Ver tienda
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
    </main>
  );
}
