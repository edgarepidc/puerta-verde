import Link from 'next/link';

import { BrandLogo } from '@/components/BrandLogo';

export default function HomePage() {
  return (
    <>
      <div className="pv-ambient" aria-hidden />
      <main className="relative mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
        <div className="pv-glass-panel p-10 sm:p-12">
          <BrandLogo href="/" imageClassName="mx-auto h-28 w-auto sm:h-32" priority />
          <div className="mt-8 space-y-3">
            <h1 className="text-4xl font-bold tracking-tight text-[var(--pv-green-900)] sm:text-5xl">
              Frescura de tu edificio a tu puerta
            </h1>
            <p className="text-lg leading-relaxed text-[var(--pv-green-800)]/80">
              Pide frutas, verduras y semillas sin registrarte. Entrega a tu depto o recoge en el local.
            </p>
          </div>
      <Link
        href="/puerta-verde-demo"
        className="pv-btn-primary mt-8 inline-block px-8 py-3.5 text-base"
      >
        Ver tienda demo
      </Link>
      <Link
        href="/registro"
        className="pv-btn-secondary mt-3 inline-block px-8 py-3 text-base"
      >
        Crear mi verdulería
      </Link>
        </div>
        <p className="text-sm text-[var(--pv-green-800)]/60">
          Pedidos por WhatsApp · Sin registro · Pago al entregar
        </p>
      </main>
    </>
  );
}
