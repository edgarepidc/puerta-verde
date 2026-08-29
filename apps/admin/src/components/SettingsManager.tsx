'use client';

import { useMemo, useState } from 'react';

import {
  STAFF_ROLE_LABELS,
  STAFF_ROLES,
  type StaffRole,
} from '@puertaverde/shared';

import { ActionChip, FoldableSummary } from '@/components/ActionChip';
import { DecimalInput, decimalFromNumber, parseDecimal } from '@/components/DecimalInput';
import { PasswordInput } from '@/components/PasswordInput';

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
  usb_scale_enabled?: boolean;
}

interface StaffRow {
  id: string;
  user_id: string;
  role: StaffRole;
  status: 'active' | 'inactive';
  full_name: string | null;
  phone: string | null;
  email?: string | null;
}

export function SettingsManager({
  initialBranch,
  initialStaff,
  canManage,
  currentUserId,
  section = 'all',
}: {
  initialBranch: BranchSettings;
  initialStaff: StaffRow[];
  canManage: boolean;
  currentUserId: string;
  section?: 'all' | 'branch' | 'staff';
}) {
  const [branch, setBranch] = useState(initialBranch);
  const [deliveryFeeText, setDeliveryFeeText] = useState(
    decimalFromNumber(initialBranch.delivery_fee),
  );
  const [minimumOrderText, setMinimumOrderText] = useState(
    decimalFromNumber(initialBranch.minimum_order_amount),
  );
  const [staff, setStaff] = useState(initialStaff);
  const [savingBranch, setSavingBranch] = useState(false);
  const [savingStaff, setSavingStaff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staffForm, setStaffForm] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'staff' as StaffRole,
  });
  const [openTienda, setOpenTienda] = useState(true);
  const [openEquipo, setOpenEquipo] = useState(true);
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveBranch() {
    setSavingBranch(true);
    setError(null);
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickupInstructions: branch.pickup_instructions,
          deliveryFee: parseDecimal(deliveryFeeText),
          minimumOrderAmount: parseDecimal(minimumOrderText),
          address: branch.address,
          whatsappPhone: branch.whatsapp_phone,
          openingHours: branch.opening_hours,
          fulfillmentMode: branch.fulfillment_mode ?? 'both',
          usbScaleEnabled: Boolean(branch.usb_scale_enabled),
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

  async function setStaffPassword(id: string) {
    const password = resetPassword.trim();
    if (password.length < 8) {
      setError('La contraseña nueva debe tener al menos 8 caracteres');
      return;
    }
    setSavingPassword(true);
    setError(null);
    try {
      const response = await fetch(`/api/staff/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar la contraseña');
      setResetId(null);
      setResetPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar la contraseña');
    } finally {
      setSavingPassword(false);
    }
  }

  const activeStaff = useMemo(() => staff.filter((row) => row.status === 'active').length, [staff]);
  const showBranch = section === 'all' || section === 'branch';
  const showStaff = section === 'all' || section === 'staff';

  return (
    <div className="space-y-6">
      {showBranch ? (
        <details
          className="group pv-glass-card min-w-0 space-y-4 overflow-hidden p-4 sm:p-6"
          open={openTienda}
          onToggle={(event) => setOpenTienda(event.currentTarget.open)}
        >
          <FoldableSummary
            title={branch.name}
            hint={`Slug de tienda: /${branch.slug}`}
            emoji="🏪"
            iconClass="bg-emerald-100"
            actions={
              canManage ? (
                <ActionChip emoji="✅" disabled={savingBranch} onClick={() => void saveBranch()}>
                  {savingBranch ? 'Guardando…' : 'Guardar tienda'}
                </ActionChip>
              ) : undefined
            }
          />
          <div className="grid gap-4 md:grid-cols-4">
            <label className="block text-sm md:col-span-4">
              <span className="font-medium text-slate-700">Dirección</span>
              <input
                className="pv-input mt-1"
                value={branch.address ?? ''}
                disabled={!canManage}
                onChange={(e) => setBranch((b) => ({ ...b, address: e.target.value }))}
              />
            </label>
            <label className="block text-sm md:col-span-3">
              <span className="font-medium text-slate-700">Instrucciones de recolección</span>
              <textarea
                className="pv-input mt-1"
                rows={2}
                value={branch.pickup_instructions ?? ''}
                disabled={!canManage}
                onChange={(e) => setBranch((b) => ({ ...b, pickup_instructions: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Modo de venta</span>
              <select
                className="pv-input mt-1 py-1.5 text-sm"
                value={branch.fulfillment_mode ?? 'both'}
                disabled={!canManage}
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
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Costo de envío</span>
              <DecimalInput
                placeholder="0"
                className="pv-input mt-1"
                groupThousands
                value={deliveryFeeText}
                disabled={!canManage}
                onChange={(value) => {
                  setDeliveryFeeText(value);
                  setBranch((b) => ({ ...b, delivery_fee: parseDecimal(value) }));
                }}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Pedido mínimo</span>
              <DecimalInput
                placeholder="0"
                className="pv-input mt-1"
                groupThousands
                value={minimumOrderText}
                disabled={!canManage}
                onChange={(value) => {
                  setMinimumOrderText(value);
                  setBranch((b) => ({ ...b, minimum_order_amount: parseDecimal(value) }));
                }}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">WhatsApp</span>
              <input
                className="pv-input mt-1"
                value={branch.whatsapp_phone ?? ''}
                disabled={!canManage}
                onChange={(e) => setBranch((b) => ({ ...b, whatsapp_phone: e.target.value }))}
                placeholder="5512345678"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Horario</span>
              <input
                className="pv-input mt-1"
                value={branch.opening_hours ?? ''}
                disabled={!canManage}
                onChange={(e) => setBranch((b) => ({ ...b, opening_hours: e.target.value }))}
                placeholder="Lun–Sáb 8:00–20:00"
              />
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white/60 p-3 text-sm md:col-span-4">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={Boolean(branch.usb_scale_enabled)}
                disabled={!canManage}
                onChange={(e) =>
                  setBranch((b) => ({ ...b, usb_scale_enabled: e.target.checked }))
                }
              />
              <span>
                <span className="font-medium text-slate-800">Báscula USB / serial</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Muestra «Conectar báscula» en el mostrador (Chrome/Edge). Déjala apagada si aún no
                  usas báscula conectada; el peso se captura a mano.
                </span>
              </span>
            </label>
          </div>
          {!canManage ? (
            <p className="text-sm text-slate-500">Solo lectura · no tienes permiso para editar la sucursal.</p>
          ) : null}
        </details>
      ) : null}

      {showStaff ? (
        <details
          className="group pv-glass-card min-w-0 space-y-4 overflow-hidden p-4 sm:p-6"
          open={openEquipo}
          onToggle={(event) => setOpenEquipo(event.currentTarget.open)}
        >
          <FoldableSummary
            title="Usuarios del panel"
            hint={`${activeStaff} activos · solo el administrador crea cuentas`}
            emoji="👥"
            iconClass="bg-sky-100"
          />

          <ul className="divide-y divide-slate-100">
            {staff.map((row) => {
              const isYou = row.user_id === currentUserId;
              const resetting = resetId === row.id;
              return (
                <li key={row.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{row.full_name ?? 'Sin nombre'}</p>
                      <p className="text-sm text-slate-500">
                        {STAFF_ROLE_LABELS[row.role]}
                        {row.status === 'inactive' ? ' · inactivo' : ''}
                        {isYou ? ' · tú' : ''}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {row.email ?? 'Sin usuario'}
                      </p>
                    </div>
                    {canManage && !isYou ? (
                      <div className="flex shrink-0 flex-nowrap items-center gap-2">
                        <div className="w-40 shrink-0">
                          <select
                            className="pv-input py-1.5 text-sm"
                            value={row.role}
                            onChange={(e) =>
                              void updateStaff(row.id, { role: e.target.value as StaffRole })
                            }
                          >
                            {STAFF_ROLES.map((role) => (
                              <option key={role} value={role}>
                                {STAFF_ROLE_LABELS[role]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <ActionChip
                          className="shrink-0"
                          elevated={false}
                          tone={row.status === 'active' ? 'rose' : 'emerald'}
                          emoji={row.status === 'active' ? '⏸️' : '▶️'}
                          onClick={() =>
                            void updateStaff(row.id, {
                              status: row.status === 'active' ? 'inactive' : 'active',
                            })
                          }
                        >
                          {row.status === 'active' ? 'Desactivar' : 'Activar'}
                        </ActionChip>
                        <ActionChip
                          className="shrink-0"
                          elevated={false}
                          emoji="🔑"
                          onClick={() => {
                            setResetId(resetting ? null : row.id);
                            setResetPassword('');
                            setError(null);
                          }}
                        >
                          {resetting ? 'Cerrar' : 'Contraseña'}
                        </ActionChip>
                      </div>
                    ) : null}
                  </div>
                  {canManage && resetting ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <div className="w-56">
                        <PasswordInput
                          className="pv-input"
                          placeholder="Nueva contraseña (mín. 8)"
                          value={resetPassword}
                          onChange={(e) => setResetPassword(e.target.value)}
                          autoComplete="new-password"
                        />
                      </div>
                      <ActionChip
                        tone="emerald"
                        emoji="✅"
                        disabled={savingPassword}
                        onClick={() => void setStaffPassword(row.id)}
                      >
                        {savingPassword ? 'Guardando…' : 'Guardar clave'}
                      </ActionChip>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {canManage ? (
            <div className="min-w-0 rounded-xl bg-slate-50 p-4">
              <h3 className="font-medium text-slate-900">Nuevo usuario</h3>
              <div className="mt-3 grid min-w-0 items-end gap-3 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,10rem)]">
                <input
                  placeholder="Nombre"
                  className="pv-input min-w-0 py-1.5 text-sm"
                  value={staffForm.fullName}
                  onChange={(e) => setStaffForm((f) => ({ ...f, fullName: e.target.value }))}
                />
                <input
                  type="email"
                  placeholder="Usuario (correo)"
                  className="pv-input min-w-0 py-1.5 text-sm"
                  value={staffForm.email}
                  onChange={(e) => setStaffForm((f) => ({ ...f, email: e.target.value }))}
                />
                <PasswordInput
                  placeholder="Contraseña (mín. 8)"
                  className="pv-input min-w-0 py-1.5 text-sm"
                  wrapperClassName="min-w-0"
                  value={staffForm.password}
                  onChange={(e) => setStaffForm((f) => ({ ...f, password: e.target.value }))}
                />
                <select
                  className="pv-input min-w-0 py-1.5 text-sm"
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
              <ActionChip className="mt-3" emoji="👤" disabled={savingStaff} onClick={() => void createStaff()}>
                {savingStaff ? 'Creando…' : 'Crear usuario'}
              </ActionChip>
            </div>
          ) : null}
        </details>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
