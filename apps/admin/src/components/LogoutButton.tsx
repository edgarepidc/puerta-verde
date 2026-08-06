'use client';

import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <button type="button" onClick={logout} className="pv-btn-ghost px-4 py-2 text-sm">
      Salir
    </button>
  );
}
