'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';

import { AjustesNav, type AjustesCurrent } from '@/components/AjustesNav';

type ConfigTab = 'suscripcion' | 'sucursal' | 'equipo' | 'whatsapp' | 'plataforma';

const BASE_TABS: ConfigTab[] = ['sucursal', 'equipo', 'suscripcion'];

function resolveTab(raw: string | null, allowed: ConfigTab[]): ConfigTab {
  if (raw === 'usuarios' || raw === 'permisos' || raw === 'whatsapp') return 'equipo';
  if (raw && allowed.includes(raw as ConfigTab)) return raw as ConfigTab;
  return 'sucursal';
}

function toAjustesCurrent(tab: ConfigTab): AjustesCurrent {
  if (tab === 'suscripcion') return 'cuenta';
  if (tab === 'whatsapp') return 'equipo';
  return tab;
}

export function ConfiguracionTabs({
  isPlatformAdmin,
  suscripcion,
  sucursal,
  equipo,
  plataforma,
}: {
  isPlatformAdmin: boolean;
  suscripcion: ReactNode;
  sucursal: ReactNode;
  equipo: ReactNode;
  plataforma?: ReactNode;
}) {
  const searchParams = useSearchParams();
  const allowed = useMemo(
    () => (isPlatformAdmin ? [...BASE_TABS, 'plataforma' as const] : BASE_TABS),
    [isPlatformAdmin],
  );
  const [tab, setTab] = useState<ConfigTab>(() => resolveTab(searchParams.get('tab'), allowed));

  return (
    <div className="space-y-6">
      <AjustesNav
        current={toAjustesCurrent(tab)}
        isPlatformAdmin={isPlatformAdmin}
        onSelectConfigTab={(id) => {
          setTab(id === 'whatsapp' ? 'equipo' : id);
          const url = new URL(window.location.href);
          url.searchParams.set('tab', id === 'whatsapp' ? 'equipo' : id);
          window.history.replaceState({}, '', url);
        }}
      />

      {tab === 'suscripcion' && suscripcion}
      {tab === 'sucursal' && sucursal}
      {tab === 'equipo' && equipo}
      {tab === 'plataforma' && isPlatformAdmin ? plataforma : null}
    </div>
  );
}
