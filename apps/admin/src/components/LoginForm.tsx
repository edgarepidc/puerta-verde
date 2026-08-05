'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { BrandLogo } from '@/components/BrandLogo';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError('Correo o contraseña incorrectos.');
      setLoading(false);
      return;
    }

    const sessionResponse = await fetch('/api/auth/session');
    if (!sessionResponse.ok) {
      await supabase.auth.signOut();
      setError('Tu cuenta no tiene acceso al panel. Pide acceso al administrador.');
      setLoading(false);
      return;
    }

    const next = searchParams.get('next') ?? '/';
    router.push(next);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <div className="mb-6 flex justify-center">
          <BrandLogo href="/" imageClassName="h-14 w-auto" />
        </div>
        <h1 className="text-center text-xl font-bold text-slate-900">Acceso al panel</h1>
        <p className="mt-2 text-center text-sm text-slate-500">
          Solo personal autorizado. Si no tienes cuenta, pide acceso al administrador.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Correo
            <input
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Contraseña
            <input
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[var(--pv-green-700)] px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  );
}
