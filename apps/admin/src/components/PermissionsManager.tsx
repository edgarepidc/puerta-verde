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

import { ActionChip, FoldableSummary } from '@/components/ActionChip';

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
  const [open, setOpen] = useState(false);

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
    <details
      className="group pv-glass-card min-w-0 space-y-4 overflow-hidden p-4 sm:p-6"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <FoldableSummary
        title="Quién puede hacer qué"
        hint="Propietario ve todo · Administrador lleva la sucursal · Personal cobra y atiende"
        emoji="🔐"
        iconClass="bg-slate-100"
        actions={
          canEdit ? (
            <>
              <ActionChip elevated={false} emoji="↩️" disabled={saving} onClick={() => void restoreDefaults()}>
                Restaurar
              </ActionChip>
              <ActionChip emoji="✅" disabled={saving || !dirty} onClick={() => void save()}>
                {saving ? 'Guardando…' : 'Guardar'}
              </ActionChip>
            </>
          ) : undefined
        }
      />

      {!canEdit ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Solo el propietario o el administrador pueden cambiar estos permisos.
        </p>
      ) : null}

      {error ? <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
      {savedAt ? <p className="text-xs text-emerald-700">Guardado a las {savedAt}.</p> : null}

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
    </details>
  );
}
