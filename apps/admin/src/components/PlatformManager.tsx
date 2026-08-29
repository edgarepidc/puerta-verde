'use client';

import { useMemo, useState } from 'react';

import { slugifyOrganizationName } from '@puertaverde/shared';

import { PasswordInput } from '@/components/PasswordInput';

interface BranchRow {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  subscription_plan: string;
  subscription_status: string;
  created_at: string;
  branches: BranchRow[] | null;
}

export function PlatformManager({ initialOrganizations }: { initialOrganizations: OrgRow[] }) {
  const [organizations, setOrganizations] = useState(initialOrganizations);
  const [organizationName, setOrganizationName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [branchSlug, setBranchSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const suggestedSlug = useMemo(() => slugifyOrganizationName(organizationName), [organizationName]);
  const webUrl = process.env.NEXT_PUBLIC_WEB_URL ?? 'https://puerta-verde-web.vercel.app';

  async function refresh() {
    const response = await fetch('/api/platform/organizations');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'Error al recargar');
    setOrganizations(payload.organizations);
  }

  async function createOrg(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/platform/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName,
          branchName: branchName || organizationName,
          branchSlug: branchSlug || suggestedSlug,
          ownerName,
          email,
          password,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo crear');
      setSuccess(`Verdulería creada. Tienda: ${payload.storeUrl}`);
      setOrganizationName('');
      setBranchName('');
      setBranchSlug('');
      setSlugTouched(false);
      setOwnerName('');
      setEmail('');
      setPassword('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="pv-glass-card p-6">
        <h2 className="text-lg font-semibold text-slate-900">Nueva verdulería</h2>
        <p className="mt-1 text-sm text-slate-500">
          Solo tú (super admin) puedes crear tenants. Se crea la organización, la sucursal y el usuario owner.
        </p>

        <form onSubmit={createOrg} className="mt-6 grid min-w-0 gap-4 md:grid-cols-4">
          <label className="block text-sm font-medium text-slate-700 md:col-span-2">
            Nombre de la verdulería
            <input
              className="pv-input mt-1"
              value={organizationName}
              onChange={(e) => {
                setOrganizationName(e.target.value);
                if (!slugTouched) setBranchSlug(slugifyOrganizationName(e.target.value));
              }}
              required
            />
          </label>
          <label className="block text-sm font-medium text-slate-700 md:col-span-2">
            Nombre de la sucursal
            <input
              className="pv-input mt-1"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="Misma que la verdulería si lo dejas vacío"
            />
          </label>
          <label className="block min-w-0 text-sm font-medium text-slate-700 md:col-span-4">
            Slug de la tienda pública
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-xs text-slate-400">{webUrl}/</span>
              <div className="min-w-0 flex-1">
                <input
                  className="pv-input"
                  value={branchSlug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setBranchSlug(slugifyOrganizationName(e.target.value));
                  }}
                  required
                />
              </div>
            </div>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Nombre del owner
            <input
              className="pv-input mt-1"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm font-medium text-slate-700 md:col-span-2">
            Correo del owner
            <input
              type="email"
              className="pv-input mt-1"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Contraseña temporal
            <PasswordInput
              className="pv-input"
              wrapperClassName="mt-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>

          {error && <p className="text-sm text-red-600 md:col-span-4">{error}</p>}
          {success && <p className="text-sm text-[var(--pv-green-700)] md:col-span-4">{success}</p>}

          <button type="submit" disabled={saving} className="pv-btn-primary px-5 py-2.5 text-sm md:col-span-4">
            {saving ? 'Creando...' : 'Crear verdulería'}
          </button>
        </form>
      </section>

      <section className="pv-glass-card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Verdulerías ({organizations.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Slug</th>
                <th className="px-4 py-2">Plan</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Sucursales</th>
                <th className="px-4 py-2">Tienda</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((org) => {
                const branches = org.branches ?? [];
                const primary = branches[0];
                return (
                  <tr key={org.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{org.name}</td>
                    <td className="px-4 py-3 text-slate-600">{org.slug}</td>
                    <td className="px-4 py-3">{org.subscription_plan}</td>
                    <td className="px-4 py-3">{org.subscription_status}</td>
                    <td className="px-4 py-3">
                      {branches.map((b) => b.name).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {primary ? (
                        <a
                          href={`${webUrl}/${primary.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--pv-green-700)] hover:underline"
                        >
                          /{primary.slug}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
              {organizations.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Aún no hay verdulerías.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
