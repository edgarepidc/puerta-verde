'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';

type ConfigTab = 'suscripcion' | 'sucursal' | 'equipo' | 'whatsapp' | 'plataforma';

const BASE_TABS: Array<{ id: ConfigTab; label: string }> = [
  { id: 'suscripcion', label: 'Suscripción' },
  { id: 'sucursal', label: 'Sucursal' },
  { id: 'equipo', label: 'Equipo' },
  { id: 'whatsapp', label: 'WhatsApp' },
];

function resolveTab(raw: string | null, allowed: ConfigTab[]): ConfigTab {
  if (raw === 'usuarios' || raw === 'permisos') return 'equipo';
  if (raw && allowed.includes(raw as ConfigTab)) return raw as ConfigTab;
  return 'suscripcion';
}

export function ConfiguracionTabs({
  isPlatformAdmin,
  suscripcion,
  sucursal,
  equipo,
  whatsapp,
  plataforma,
}: {
  isPlatformAdmin: boolean;
  suscripcion: ReactNode;
  sucursal: ReactNode;
  equipo: ReactNode;
  whatsapp: ReactNode;
  plataforma?: ReactNode;
}) {
  const searchParams = useSearchParams();
  const tabs = useMemo(
    () =>
      isPlatformAdmin
        ? [...BASE_TABS, { id: 'plataforma' as const, label: 'Plataforma' }]
        : BASE_TABS,
    [isPlatformAdmin],
  );
  const [tab, setTab] = useState<ConfigTab>(() =>
    resolveTab(searchParams.get('tab'), tabs.map((item) => item.id)),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-center gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setTab(item.id);
              const url = new URL(window.location.href);
              url.searchParams.set('tab', item.id);
              window.history.replaceState({}, '', url);
            }}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              tab === item.id
                ? 'bg-slate-900 text-white'
                : 'bg-white/70 text-slate-700 hover:bg-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'suscripcion' && suscripcion}
      {tab === 'sucursal' && sucursal}
      {tab === 'equipo' && equipo}
      {tab === 'whatsapp' && whatsapp}
      {tab === 'plataforma' && isPlatformAdmin ? plataforma : null}
    </div>
  );
}
