'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { slugifyOrganizationName } from '@puertaverde/shared';

import { BrandLogo } from '@/components/BrandLogo';

export function OnboardingForm() {
  const [organizationName, setOrganizationName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [branchSlug, setBranchSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    storeUrl: string;
    adminUrl: string;
    branchSlug: string;
  } | null>(null);

  const suggestedSlug = useMemo(() => slugifyOrganizationName(organizationName), [organizationName]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName,
          branchName,
          branchSlug: branchSlug || suggestedSlug,
          ownerName,
          email,
          password,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo crear la cuenta');
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar');
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="pv-glass-panel w-full max-w-lg p-8 text-center sm:p-10">
        <h1 className="text-2xl font-bold text-[var(--pv-green-900)]">¡Tu verdulería está lista!</h1>
        <p className="mt-3 text-[var(--pv-green-800)]/80">
          Ya puedes entrar al panel y empezar a cargar productos.
        </p>
        <div className="mt-6 space-y-3 text-sm">
          <a href={result.adminUrl} className="pv-btn-primary inline-block w-full px-4 py-3">
            Ir al panel admin
          </a>
          <a href={result.storeUrl} className="pv-btn-secondary inline-block w-full px-4 py-3">
            Ver tienda pública
          </a>
        </div>
        <p className="mt-4 text-xs text-[var(--pv-green-800)]/60">
          Slug de tienda: <strong>{result.branchSlug}</strong>
        </p>
      </div>
    );
  }

  return (
    <div className="pv-glass-panel w-full max-w-lg p-8 sm:p-10">
      <div className="mb-6 flex justify-center">
        <BrandLogo href="/" imageClassName="h-20 w-auto" />
      </div>
      <h1 className="text-center text-2xl font-bold text-[var(--pv-green-900)]">
        Crea tu verdulería
      </h1>
      <p className="mt-2 text-center text-sm text-[var(--pv-green-800)]/80">
        14 días de prueba · Tienda web + panel admin incluidos
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <label className="block text-sm font-medium text-[var(--pv-green-900)]">
          Nombre de la verdulería
          <input
            className="pv-input mt-1"
            value={organizationName}
            onChange={(e) => {
              setOrganizationName(e.target.value);
              if (!slugTouched) setBranchSlug(slugifyOrganizationName(e.target.value));
            }}
            placeholder="Puerta Verde"
            required
          />
        </label>
        <label className="block text-sm font-medium text-[var(--pv-green-900)]">
          Nombre de la sucursal
          <input
            className="pv-input mt-1"
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            placeholder="Torre A"
            required
          />
        </label>
        <label className="block text-sm font-medium text-[var(--pv-green-900)]">
          URL de tu tienda
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-[var(--pv-green-800)]/60">...vercel.app/</span>
            <input
              className="pv-input flex-1"
              value={branchSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setBranchSlug(slugifyOrganizationName(e.target.value));
              }}
              placeholder={suggestedSlug || 'mi-verduleria'}
              required
            />
          </div>
        </label>
        <label className="block text-sm font-medium text-[var(--pv-green-900)]">
          Tu nombre
          <input
            className="pv-input mt-1"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm font-medium text-[var(--pv-green-900)]">
          Correo
          <input
            type="email"
            className="pv-input mt-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm font-medium text-[var(--pv-green-900)]">
          Contraseña
          <input
            type="password"
            className="pv-input mt-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={loading} className="pv-btn-primary w-full px-4 py-3">
          {loading ? 'Creando cuenta...' : 'Crear mi verdulería'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--pv-green-800)]/70">
        ¿Ya tienes cuenta?{' '}
        <Link href="https://puerta-verde-admin.vercel.app/login" className="font-medium text-[var(--pv-green-700)]">
          Entrar al panel
        </Link>
      </p>
    </div>
  );
}
