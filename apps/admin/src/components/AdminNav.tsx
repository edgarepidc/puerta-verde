'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', label: 'Pedidos' },
  { href: '/productos', label: 'Productos' },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex rounded-full bg-slate-100 p-1">
      {NAV.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              active
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
