'use client';

import Link from 'next/link';

export type AjustesCurrent =
  | 'sucursal'
  | 'equipo'
  | 'promos'
  | 'clientes'
  | 'cuenta'
  | 'plataforma'
  | 'whatsapp';

type ConfigTabId = 'sucursal' | 'equipo' | 'suscripcion' | 'plataforma' | 'whatsapp';

type NavItem = {
  id: Exclude<AjustesCurrent, 'whatsapp'>;
  label: string;
  href: string;
  configTab?: ConfigTabId;
};

const ITEMS: NavItem[] = [
  { id: 'sucursal', label: 'Tienda', href: '/configuracion?tab=sucursal', configTab: 'sucursal' },
  { id: 'equipo', label: 'Equipo', href: '/configuracion?tab=equipo', configTab: 'equipo' },
  { id: 'promos', label: 'Promos', href: '/promociones' },
  { id: 'clientes', label: 'Clientes', href: '/clientes' },
  { id: 'cuenta', label: 'Cuenta', href: '/configuracion?tab=suscripcion', configTab: 'suscripcion' },
];

export function AjustesNav({
  current,
  isPlatformAdmin = false,
  onSelectConfigTab,
}: {
  current: AjustesCurrent;
  isPlatformAdmin?: boolean;
  onSelectConfigTab?: (tab: ConfigTabId) => void;
}) {
  const items = isPlatformAdmin
    ? [
        ...ITEMS,
        {
          id: 'plataforma' as const,
          label: 'Plataforma',
          href: '/configuracion?tab=plataforma',
          configTab: 'plataforma' as const,
        },
      ]
    : ITEMS;

  const highlight = current === 'whatsapp' ? 'equipo' : current;
  const navOn = 'rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white';
  const navOff =
    'rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800';

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {items.map((item) => {
        const className = item.id === highlight ? navOn : navOff;
        if (onSelectConfigTab && item.configTab) {
          return (
            <button
              key={item.id}
              type="button"
              className={className}
              onClick={() => onSelectConfigTab(item.configTab!)}
            >
              {item.label}
            </button>
          );
        }
        return (
          <Link key={item.id} href={item.href} className={className}>
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
