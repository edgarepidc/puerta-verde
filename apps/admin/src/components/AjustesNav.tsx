'use client';

import Link from 'next/link';

import { ActionChip } from '@/components/ActionChip';

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
  emoji: string;
  configTab?: ConfigTabId;
};

const ITEMS: NavItem[] = [
  { id: 'sucursal', label: 'Tienda', href: '/configuracion?tab=sucursal', emoji: '🏪', configTab: 'sucursal' },
  { id: 'equipo', label: 'Equipo', href: '/configuracion?tab=equipo', emoji: '👥', configTab: 'equipo' },
  { id: 'promos', label: 'Promos', href: '/promociones', emoji: '🏷️' },
  { id: 'clientes', label: 'Clientes', href: '/clientes', emoji: '🧑' },
  { id: 'cuenta', label: 'Cuenta', href: '/configuracion?tab=suscripcion', configTab: 'suscripcion', emoji: '🔑' },
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
          emoji: '🛠️',
          configTab: 'plataforma' as const,
        },
      ]
    : ITEMS;

  const highlight = current === 'whatsapp' ? 'equipo' : current;

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {items.map((item) => {
        const active = item.id === highlight;
        const chip = (
          <ActionChip
            as={onSelectConfigTab && item.configTab ? 'button' : 'span'}
            emoji={item.emoji}
            tone={active ? 'emerald' : 'slate'}
            elevated={active}
            onClick={
              onSelectConfigTab && item.configTab
                ? () => onSelectConfigTab(item.configTab!)
                : undefined
            }
          >
            {item.label}
          </ActionChip>
        );
        if (onSelectConfigTab && item.configTab) return <span key={item.id}>{chip}</span>;
        return (
          <Link key={item.id} href={item.href} className="inline-flex">
            {chip}
          </Link>
        );
      })}
    </div>
  );
}
