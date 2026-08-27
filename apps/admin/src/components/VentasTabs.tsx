'use client';

import { useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';

type VentasSection = 'pedidos' | 'stock';

const TABS: Array<{ id: VentasSection; label: string }> = [
  { id: 'pedidos', label: 'Pedidos' },
  { id: 'stock', label: 'Transacciones y pronóstico' },
];

export function VentasTabs({
  pedidos,
  stock,
}: {
  pedidos: ReactNode;
  stock: ReactNode;
}) {
  const searchParams = useSearchParams();
  const requested = searchParams.get('section') ?? searchParams.get('tab');
  const initial: VentasSection =
    requested === 'stock' || requested === 'reposicion' ? 'stock' : 'pedidos';
  const [section, setSection] = useState<VentasSection>(initial);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-center gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setSection(item.id);
              const url = new URL(window.location.href);
              url.searchParams.set('section', item.id);
              window.history.replaceState({}, '', url);
            }}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              section === item.id
                ? 'bg-slate-900 text-white'
                : 'bg-white/70 text-slate-700 hover:bg-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {section === 'pedidos' ? pedidos : stock}
    </div>
  );
}
