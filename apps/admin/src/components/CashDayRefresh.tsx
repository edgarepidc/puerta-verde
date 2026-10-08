'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { addMexicoDays, todayMexicoYmd } from '@/lib/mexico-date';

const CHECK_MS = 60_000;

/** Milliseconds until just after the next midnight in Mexico City. */
function msUntilNextMexicoMidnight(now = new Date()): number {
  const next = addMexicoDays(todayMexicoYmd(now), 1);
  const midnight = new Date(`${next}T00:00:00-06:00`).getTime();
  return Math.max(1_000, midnight - now.getTime() + 2_000);
}

/**
 * The cash-close window is chosen on the server for the Mexico day of that
 * render. A register left open overnight never asks again until this refreshes
 * the page data when the calendar day changes.
 */
export function CashDayRefresh({ today }: { today: string }) {
  const router = useRouter();
  const todayRef = useRef(today);

  useEffect(() => {
    todayRef.current = today;
  }, [today]);

  useEffect(() => {
    let refreshing = false;
    let midnightTimer = 0;

    function check() {
      if (refreshing || todayMexicoYmd() === todayRef.current) return;
      refreshing = true;
      router.refresh();
    }

    function armMidnight() {
      window.clearTimeout(midnightTimer);
      midnightTimer = window.setTimeout(() => {
        check();
        armMidnight();
      }, msUntilNextMexicoMidnight());
    }

    const interval = window.setInterval(check, CHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    armMidnight();

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(midnightTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
    };
  }, [router]);

  return null;
}
