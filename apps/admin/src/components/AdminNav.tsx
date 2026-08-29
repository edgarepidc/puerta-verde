'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const NAV: Array<{ href: string; label: string; aliases?: readonly string[] }> = [
  { href: '/', label: 'Ventas' },
  { href: '/compras', label: 'Compras' },
  { href: '/productos', label: 'Productos' },
  { href: '/caja', label: 'Caja' },
  { href: '/numeros', label: 'Números' },
  { href: '/configuracion', label: 'Ajustes', aliases: ['/promociones', '/clientes'] },
];

function isActive(pathname: string, href: string, aliases?: readonly string[]) {
  if (pathname === href || (href !== '/' && pathname.startsWith(href))) return true;
  return Boolean(aliases?.some((alias) => pathname === alias || pathname.startsWith(`${alias}/`)));
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      {open ? (
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </>
      ) : (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </>
      )}
    </svg>
  );
}

export function AdminNav({ isPlatformAdmin: _isPlatformAdmin = false }: { isPlatformAdmin?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 text-slate-800 shadow-sm md:hidden"
        aria-expanded={open}
        aria-controls="admin-mobile-nav"
        aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        onClick={() => setOpen((value) => !value)}
      >
        <MenuIcon open={open} />
      </button>

      <nav
        className="pv-glass-nav hidden flex-nowrap items-center justify-center rounded-full p-0.5 md:flex"
        aria-label="Navegación principal"
      >
        {NAV.map((item) => {
          const active = isActive(pathname, item.href, item.aliases);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 rounded-full px-2 py-1.5 text-xs font-medium transition lg:px-2.5 lg:text-sm ${
                active
                  ? 'pv-nav-active'
                  : 'text-slate-600 hover:bg-white/50 hover:text-slate-900'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden" id="admin-mobile-nav">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-0 top-0 max-h-[min(100dvh,100%)] overflow-y-auto border-b border-slate-200/80 bg-white/95 px-4 pb-6 pt-4 shadow-xl backdrop-blur-md">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Menú</p>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-700"
                aria-label="Cerrar menú"
                onClick={() => setOpen(false)}
              >
                <MenuIcon open />
              </button>
            </div>
            <nav className="grid gap-1" aria-label="Navegación móvil">
              {NAV.map((item) => {
                const active = isActive(pathname, item.href, item.aliases);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-xl px-4 py-3 text-base font-medium transition ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      ) : null}
    </>
  );
}
