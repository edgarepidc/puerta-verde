'use client';

import { useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';

type PromoSection = 'avisos' | 'cupones';

const TABS: Array<{ id: PromoSection; label: string }> = [
  { id: 'avisos', label: 'Avisos' },
  { id: 'cupones', label: 'Cupones' },
];

export function PromotionsTabs({
  avisos,
  cupones,
}: {
  avisos: ReactNode;
  cupones: ReactNode;
}) {
  const searchParams = useSearchParams();
  const requested = searchParams.get('section') ?? searchParams.get('tab');
  const initial: PromoSection = requested === 'cupones' ? 'cupones' : 'avisos';
  const [section, setSection] = useState<PromoSection>(initial);

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
      {section === 'avisos' ? avisos : cupones}
    </div>
  );
}
