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
  { href: '/utilidades', label: 'Utilidades' },
  { href: '/configuracion', label: 'Configuración' },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="pv-glass-nav flex max-w-full overflow-x-auto rounded-full p-1">
      {NAV.map((item) => {
        const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              active
                ? 'bg-white/80 text-slate-900 shadow-sm backdrop-blur-sm'
                : 'text-slate-600 hover:bg-white/40 hover:text-slate-900'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
