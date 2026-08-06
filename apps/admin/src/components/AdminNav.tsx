'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', label: 'Pedidos' },
  { href: '/productos', label: 'Productos' },
  { href: '/promociones', label: 'Promociones' },
  { href: '/inventario', label: 'Inventario' },
  { href: '/lotes', label: 'Lotes / PTI' },
  { href: '/pronosticos', label: 'Pronósticos' },
  { href: '/caja', label: 'Caja' },
  { href: '/utilidades', label: 'Utilidades' },
  { href: '/configuracion', label: 'Configuración' },
] as const;

export function AdminNav({ isPlatformAdmin = false }: { isPlatformAdmin?: boolean }) {
  const pathname = usePathname();
  const items = isPlatformAdmin
    ? ([{ href: '/plataforma', label: 'Plataforma' }, ...NAV] as const)
    : NAV;

  return (
    <nav className="pv-glass-nav flex max-w-full overflow-x-auto rounded-full p-1">
      {items.map((item) => {
        const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full px-4 py-2 text-sm transition ${
              active
                ? 'pv-nav-active'
                : 'font-medium text-slate-600 hover:bg-white/50 hover:text-slate-900'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
