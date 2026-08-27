'use client';

import { useMemo, useState } from 'react';

import {
  PERMISSIONS,
  STAFF_ROLE_LABELS,
  STAFF_ROLES,
  normalizePermissionMatrixInput,
  type PermissionKey,
  type PermissionMatrix,
  type StaffRole,
} from '@puertaverde/shared';

const EDITABLE_ROLES = STAFF_ROLES.filter((role) => role !== 'owner');

export function PermissionsManager({
  initialMatrix,
  canEdit,
}: {
  initialMatrix: PermissionMatrix;
  canEdit: boolean;
}) {
  const [matrix, setMatrix] = useState<PermissionMatrix>(() =>
    normalizePermissionMatrixInput(initialMatrix),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const dirty = useMemo(
    () => JSON.stringify(matrix) !== JSON.stringify(normalizePermissionMatrixInput(initialMatrix)),
    [matrix, initialMatrix],
  );

  function toggle(key: PermissionKey, role: StaffRole) {
    if (!canEdit || role === 'owner') return;
    setMatrix((current) => {
      const roles = new Set(current[key]);
      if (roles.has(role)) roles.delete(role);
      else roles.add(role);
      roles.add('owner');
      return {
        ...current,
        [key]: STAFF_ROLES.filter((item) => roles.has(item)),
      };
    });
    setSavedAt(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/permissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: matrix }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo guardar');
      setMatrix(normalizePermissionMatrixInput(payload.permissions));
      setSavedAt(new Date().toLocaleTimeString('es-MX'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function restoreDefaults() {
    if (!confirm('¿Restaurar los permisos por defecto?')) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/permissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: {} }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo restaurar');
      // Empty object merges to defaults on the server via normalize
      const refreshed = await fetch('/api/permissions');
      const data = await refreshed.json();
      if (!refreshed.ok) throw new Error(data.error ?? 'No se pudo recargar');
      setMatrix(normalizePermissionMatrixInput(data.permissions));
      setSavedAt(new Date().toLocaleTimeString('es-MX'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al restaurar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Permisos por perfil</h2>
          <p className="text-sm text-slate-500">
            Enciende o apaga capacidades para cada perfil. El propietario siempre tiene acceso total.
          </p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="pv-btn-ghost px-4 py-2 text-sm"
              disabled={saving}
              onClick={restoreDefaults}
            >
              Restaurar defaults
            </button>
            <button
              type="button"
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={saving || !dirty}
              onClick={save}
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        ) : (
          <p className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">Solo lectura</p>
        )}
      </div>

      {!canEdit ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Solo el propietario o el gerente de sucursal pueden cambiar estos permisos.
        </p>
      ) : null}

      {error ? <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
      {savedAt ? (
        <p className="text-xs text-emerald-700">Guardado a las {savedAt}.</p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Capacidad</th>
              {STAFF_ROLES.map((role) => (
                <th key={role} className="px-3 py-3 text-center font-medium">
                  {STAFF_ROLE_LABELS[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((permission) => (
              <tr key={permission.key} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 align-top">
                  <p className="font-medium text-slate-900">{permission.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{permission.description}</p>
                </td>
                {STAFF_ROLES.map((role) => {
                  const checked = matrix[permission.key]?.includes(role) ?? false;
                  const locked = role === 'owner' || !canEdit;
                  return (
                    <td key={role} className="px-3 py-3 text-center align-middle">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={checked}
                        disabled={locked}
                        onChange={() => toggle(permission.key, role)}
                        aria-label={`${permission.label} · ${STAFF_ROLE_LABELS[role]}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        Perfiles editables: {EDITABLE_ROLES.map((role) => STAFF_ROLE_LABELS[role]).join(', ')}.
      </p>
    </section>
  );
}
