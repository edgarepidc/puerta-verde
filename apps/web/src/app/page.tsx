import Link from 'next/link';

import { BrandLogo } from '@/components/BrandLogo';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <BrandLogo href="/" imageClassName="h-28 w-auto sm:h-32" priority />
      <div className="space-y-3">
        <h1 className="text-4xl font-bold text-[var(--pv-green-900)]">
          Frescura de tu edificio a tu puerta
        </h1>
        <p className="text-lg text-[var(--pv-green-800)]">
          Pide frutas, verduras y semillas sin registrarte. Entrega a tu depto o recoge en el local.
        </p>
      </div>
      <Link
        href="/puerta-verde-demo"
        className="rounded-full bg-[var(--pv-green-700)] px-8 py-3 font-semibold text-white shadow-lg transition hover:bg-[var(--pv-green-800)]"
      >
        Ver tienda demo
      </Link>
    </main>
  );
}
