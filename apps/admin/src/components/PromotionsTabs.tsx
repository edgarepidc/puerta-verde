'use client';

import { useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { ActionChip } from '@/components/ActionChip';

type PromoSection = 'avisos' | 'cupones';

const TABS: Array<{ id: PromoSection; label: string; emoji: string }> = [
  { id: 'avisos', label: 'Cartel en la vitrina', emoji: '🏷️' },
  { id: 'cupones', label: 'Código al cobrar', emoji: '🎟️' },
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
          <ActionChip
            key={item.id}
            emoji={item.emoji}
            tone={section === item.id ? 'emerald' : 'slate'}
            elevated={section === item.id}
            onClick={() => {
              setSection(item.id);
              const url = new URL(window.location.href);
              url.searchParams.set('section', item.id);
              window.history.replaceState({}, '', url);
            }}
          >
            {item.label}
          </ActionChip>
        ))}
      </div>
      {section === 'avisos' ? avisos : cupones}
    </div>
  );
}
