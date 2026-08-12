'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  STAFF_ROLE_LABELS,
  STAFF_ROLES,
  formatMoney,
  type StaffRole,
} from '@puertaverde/shared';

interface BranchSettings {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  pickup_instructions: string | null;
  delivery_fee: number;
  minimum_order_amount: number;
  whatsapp_phone?: string | null;
  opening_hours?: string | null;
  fulfillment_mode?: 'pickup' | 'delivery' | 'both';
}

interface BuildingRow {
  id: string;
  name: string;
  units: Array<{ id: string; identifier: string }>;
}

interface StaffRow {
  id: string;
  user_id: string;
  role: StaffRole;
  status: 'active' | 'inactive';
  full_name: string | null;
  phone: string | null;
}

export function SettingsManager({
  initialBranch,
  initialStaff,
  canManage,
  currentUserId,
}: {
  initialBranch: BranchSettings;
  initialStaff: StaffRow[];
  canManage: boolean;
  currentUserId: string;
}) {
  const [branch, setBranch] = useState(initialBranch);
  const [staff, setStaff] = useState(initialStaff);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [savingBranch, setSavingBranch] = useState(false);
  const [savingStaff, setSavingStaff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buildingName, setBuildingName] = useState('');
  const [unitDraft, setUnitDraft] = useState<Record<string, string>>({});
  const [staffForm, setStaffForm] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'staff' as StaffRole,
  });

  async function saveBranch() {
    setSavingBranch(true);
    setError(null);
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickupInstructions: branch.pickup_instructions,
          deliveryFee: Number(branch.delivery_fee),
          minimumOrderAmount: Number(branch.minimum_order_amount),
          address: branch.address,
          whatsappPhone: branch.whatsapp_phone,
          openingHours: branch.opening_hours,
          fulfillmentMode: branch.fulfillment_mode ?? 'both',
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar sucursal');
    } finally {
      setSavingBranch(false);
    }
  }

  async function refreshBuildings() {
    const response = await fetch('/api/locations');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'Error al cargar torres');
    setBuildings(payload.buildings ?? []);
  }

  async function refreshStaff() {
    const response = await fetch('/api/staff');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'Error al recargar');
    setStaff(payload.staff);
  }

  async function createStaff() {
    setSavingStaff(true);
    setError(null);
    try {
      const response = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(staffForm),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo crear');
      setStaffForm({ email: '', password: '', fullName: '', role: 'staff' });
      await refreshStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear usuario');
    } finally {
      setSavingStaff(false);
    }
  }

  async function updateStaff(id: string, updates: { role?: StaffRole; status?: 'active' | 'inactive' }) {
    setError(null);
    const response = await fetch(`/api/staff/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? 'No se pudo actualizar');
      return;
    }
    await refreshStaff();
  }

  const activeStaff = useMemo(() => staff.filter((row) => row.status === 'active').length, [staff]);

  useEffect(() => {
    refreshBuildings().catch(() => undefined);
  }, []);

  return (
    <div className="space-y-8">
      <section className="pv-glass-card p-6">
        <h2 className="text-lg font-semibold text-slate-900">Sucursal: {branch.name}</h2>
        <p className="mt-1 text-sm text-slate-500">Slug de tienda: /{branch.slug}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm md:col-span-2">
            <span className="font-medium text-slate-700">Dirección</span>
            <input
              className="pv-input mt-1"
              value={branch.address ?? ''}
              onChange={(e) => setBranch((b) => ({ ...b, address: e.target.value }))}
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="font-medium text-slate-700">Instrucciones de recolección</span>
            <textarea
              className="pv-input mt-1"
              rows={2}
              value={branch.pickup_instructions ?? ''}
              onChange={(e) => setBranch((b) => ({ ...b, pickup_instructions: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Costo de envío</span>
            <input
              type="number"
              min={0}
              step={0.01}
              className="pv-input mt-1"
              value={branch.delivery_fee}
              onChange={(e) => setBranch((b) => ({ ...b, delivery_fee: Number(e.target.value) }))}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Pedido mínimo</span>
            <input
              type="number"
              min={0}
              step={0.01}
              className="pv-input mt-1"
              value={branch.minimum_order_amount}
              onChange={(e) => setBranch((b) => ({ ...b, minimum_order_amount: Number(e.target.value) }))}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">WhatsApp de la sucursal</span>
            <input
              className="pv-input mt-1"
              value={branch.whatsapp_phone ?? ''}
              onChange={(e) => setBranch((b) => ({ ...b, whatsapp_phone: e.target.value }))}
              placeholder="5512345678"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Horario</span>
            <input
              className="pv-input mt-1"
              value={branch.opening_hours ?? ''}
              onChange={(e) => setBranch((b) => ({ ...b, opening_hours: e.target.value }))}
              placeholder="Lun–Sáb 8:00–20:00"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="font-medium text-slate-700">Modo de venta</span>
            <select
              className="pv-input mt-1"
              value={branch.fulfillment_mode ?? 'both'}
              onChange={(e) =>
                setBranch((b) => ({
                  ...b,
                  fulfillment_mode: e.target.value as 'pickup' | 'delivery' | 'both',
                }))
              }
            >
              <option value="both">Recoger y domicilio</option>
              <option value="pickup">Solo recoger</option>
              <option value="delivery">Solo domicilio</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          disabled={savingBranch}
          onClick={saveBranch}
          className="mt-4 pv-btn-primary px-5 py-2 text-sm disabled:opacity-50"
        >
          {savingBranch ? 'Guardando...' : 'Guardar sucursal'}
        </button>
      </section>

      <section className="pv-glass-card p-6">
        <h2 className="text-lg font-semibold text-slate-900">Torres y departamentos</h2>
        <p className="mt-1 text-sm text-slate-500">
          Necesarios si vendes a domicilio. Si solo es recoger, puedes dejarlo vacío.
        </p>
        <div className="mt-4 flex max-w-md gap-2">
          <input
            className="pv-input"
            placeholder="Nueva torre / edificio"
            value={buildingName}
            onChange={(e) => setBuildingName(e.target.value)}
          />
          <button
            type="button"
            className="pv-btn-secondary px-4 py-2 text-sm"
            onClick={async () => {
              if (!buildingName.trim()) return;
              const response = await fetch('/api/locations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: buildingName }),
              });
              if (!response.ok) {
                const result = await response.json();
                setError(result.error ?? 'No se pudo crear torre');
                return;
              }
              setBuildingName('');
              await refreshBuildings();
            }}
          >
            Agregar
          </button>
        </div>
        <div className="mt-4 space-y-4">
          {buildings.map((building) => (
            <div key={building.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-slate-900">{building.name}</p>
                <button
                  type="button"
                  className="text-xs text-red-600"
                  onClick={async () => {
                    if (!confirm(`¿Eliminar ${building.name} y sus departamentos?`)) return;
                    await fetch(`/api/locations?buildingId=${building.id}`, { method: 'DELETE' });
                    await refreshBuildings();
                  }}
                >
                  Eliminar
                </button>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {(building.units ?? []).map((unit) => unit.identifier).join(', ') || 'Sin departamentos'}
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  className="pv-input"
                  placeholder="101, 102, 103"
                  value={unitDraft[building.id] ?? ''}
                  onChange={(e) => setUnitDraft((current) => ({ ...current, [building.id]: e.target.value }))}
                />
                <button
                  type="button"
                  className="rounded-full border border-slate-300 px-3 py-1 text-sm"
                  onClick={async () => {
                    const identifiers = unitDraft[building.id];
                    if (!identifiers?.trim()) return;
                    const response = await fetch('/api/locations', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ buildingId: building.id, identifiers }),
                    });
                    if (!response.ok) {
                      const result = await response.json();
                      setError(result.error ?? 'No se pudieron agregar deptos');
                      return;
                    }
                    setUnitDraft((current) => ({ ...current, [building.id]: '' }));
                    await refreshBuildings();
                  }}
                >
                  Agregar deptos
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="pv-glass-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Usuarios del panel</h2>
            <p className="text-sm text-slate-500">{activeStaff} activos · solo el administrador crea cuentas</p>
          </div>
        </div>

        <ul className="mt-4 divide-y divide-slate-100">
          {staff.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium text-slate-900">{row.full_name ?? 'Sin nombre'}</p>
                <p className="text-sm text-slate-500">
                  {STAFF_ROLE_LABELS[row.role]}
                  {row.status === 'inactive' ? ' · inactivo' : ''}
                  {row.user_id === currentUserId ? ' · tú' : ''}
                </p>
              </div>
              {canManage && row.user_id !== currentUserId && (
                <div className="flex flex-wrap gap-2">
                  <select
                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                    value={row.role}
                    onChange={(e) => updateStaff(row.id, { role: e.target.value as StaffRole })}
                  >
                    {STAFF_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {STAFF_ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      updateStaff(row.id, { status: row.status === 'active' ? 'inactive' : 'active' })
                    }
                    className="rounded-lg border border-slate-200 px-3 py-1 text-sm"
                  >
                    {row.status === 'active' ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>

        {canManage && (
          <div className="mt-6 rounded-xl bg-slate-50 p-4">
            <h3 className="font-medium text-slate-900">Nuevo usuario</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <input
                placeholder="Nombre completo"
                className="pv-input"
                value={staffForm.fullName}
                onChange={(e) => setStaffForm((f) => ({ ...f, fullName: e.target.value }))}
              />
              <input
                type="email"
                placeholder="Correo"
                className="pv-input"
                value={staffForm.email}
                onChange={(e) => setStaffForm((f) => ({ ...f, email: e.target.value }))}
              />
              <input
                type="password"
                placeholder="Contraseña (mín. 8)"
                className="pv-input"
                value={staffForm.password}
                onChange={(e) => setStaffForm((f) => ({ ...f, password: e.target.value }))}
              />
              <select
                className="pv-input"
                value={staffForm.role}
                onChange={(e) => setStaffForm((f) => ({ ...f, role: e.target.value as StaffRole }))}
              >
                {STAFF_ROLES.filter((r) => r !== 'owner').map((role) => (
                  <option key={role} value={role}>
                    {STAFF_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={savingStaff}
              onClick={createStaff}
              className="mt-3 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {savingStaff ? 'Creando...' : 'Crear usuario'}
            </button>
          </div>
        )}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
