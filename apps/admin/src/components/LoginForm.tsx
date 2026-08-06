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
    <>
      <div className="pv-ambient pv-ambient--admin" aria-hidden />
      <main className="relative flex min-h-screen items-center justify-center px-4">
        <div className="pv-glass-panel w-full max-w-md p-8 sm:p-10">
          <div className="mb-6 flex justify-center">
            <BrandLogo href="/" imageClassName="h-20 w-auto sm:h-24" />
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
                className="pv-input mt-1"
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
                className="pv-input mt-1"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button type="submit" disabled={loading} className="pv-btn-primary w-full px-4 py-3">
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
