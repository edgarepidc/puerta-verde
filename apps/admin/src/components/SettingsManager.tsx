'use client';

import { useMemo, useState } from 'react';

import {
  STAFF_ROLE_LABELS,
  STAFF_ROLES,
  type StaffRole,
} from '@puertaverde/shared';

import { FoldableSummary } from '@/components/ActionChip';
import { DecimalInput, decimalFromNumber, parseDecimal } from '@/components/DecimalInput';
import { MirrorStorefrontCard, type MirrorStorefront } from '@/components/MirrorStorefrontCard';
import { PasswordInput } from '@/components/PasswordInput';
import { PillField, pillInputClass } from '@/components/PillField';

const menuButtonOff =
  'rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50';
const menuAction = 'pv-btn-account px-5 py-2.5 text-sm';
const menuDanger =
  'rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50';

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
  initialStorefront = null,
  canManage,
  currentUserId,
  section = 'all',
}: {
  initialBranch: BranchSettings;
  initialStaff: StaffRow[];
  initialStorefront?: MirrorStorefront | null;
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
                <button
                  type="button"
                  className={menuAction}
                  disabled={savingBranch}
                  onClick={() => void saveBranch()}
                >
                  {savingBranch ? 'Guardando…' : 'Guardar tienda'}
                </button>
              ) : undefined
            }
          />
          <div className="flex flex-wrap items-end gap-2">
            <label className="block min-w-[12rem] flex-[1_1_100%] text-sm">
              <span className="text-slate-600">Dirección</span>
              <input
                className="pv-input mt-1 text-sm"
                value={branch.address ?? ''}
                disabled={!canManage}
                onChange={(e) => setBranch((b) => ({ ...b, address: e.target.value }))}
              />
            </label>
            <label className="block min-w-[12rem] flex-[1_1_18rem] text-sm">
              <span className="text-slate-600">Instrucciones de recolección</span>
              <textarea
                className="pv-input mt-1 text-sm"
                rows={2}
                value={branch.pickup_instructions ?? ''}
                disabled={!canManage}
                onChange={(e) => setBranch((b) => ({ ...b, pickup_instructions: e.target.value }))}
              />
            </label>
            <label className="block w-[14rem] shrink-0 text-sm">
              <span className="text-slate-600">Modo de venta</span>
              <select
                className="pv-input mt-1 block text-sm"
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
            <PillField label="Costo de envío" icon="$" tone="emerald" className="w-[9.75rem] shrink-0">
              <DecimalInput
                placeholder="0"
                className={pillInputClass('emerald')}
                groupThousands
                value={deliveryFeeText}
                disabled={!canManage}
                onChange={(value) => {
                  setDeliveryFeeText(value);
                  setBranch((b) => ({ ...b, delivery_fee: parseDecimal(value) }));
                }}
              />
            </PillField>
            <PillField label="Pedido mínimo" icon="$" tone="emerald" className="w-[9.75rem] shrink-0">
              <DecimalInput
                placeholder="0"
                className={pillInputClass('emerald')}
                groupThousands
                value={minimumOrderText}
                disabled={!canManage}
                onChange={(value) => {
                  setMinimumOrderText(value);
                  setBranch((b) => ({ ...b, minimum_order_amount: parseDecimal(value) }));
                }}
              />
            </PillField>
            <label className="block min-w-[12rem] flex-1 text-sm">
              <span className="text-slate-600">WhatsApp</span>
              <input
                className="pv-input mt-1 text-sm"
                value={branch.whatsapp_phone ?? ''}
                disabled={!canManage}
                onChange={(e) => setBranch((b) => ({ ...b, whatsapp_phone: e.target.value }))}
                placeholder="5512345678"
              />
            </label>
            <label className="block min-w-[12rem] flex-1 text-sm">
              <span className="text-slate-600">Horario</span>
              <input
                className="pv-input mt-1 text-sm"
                value={branch.opening_hours ?? ''}
                disabled={!canManage}
                onChange={(e) => setBranch((b) => ({ ...b, opening_hours: e.target.value }))}
                placeholder="Lun–Sáb 8:00–20:00"
              />
            </label>
            <label className="flex min-w-[12rem] flex-[1_1_100%] items-start gap-3 rounded-xl border border-slate-200 bg-white/60 p-3 text-sm">
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

      {showBranch ? (
        <MirrorStorefrontCard initial={initialStorefront} canManage={canManage} />
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
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <div className="w-[11.5rem] shrink-0">
                          <select
                            className="pv-input text-sm"
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
                        <button
                          type="button"
                          className={row.status === 'active' ? menuDanger : menuButtonOff}
                          onClick={() =>
                            void updateStaff(row.id, {
                              status: row.status === 'active' ? 'inactive' : 'active',
                            })
                          }
                        >
                          {row.status === 'active' ? 'Desactivar' : 'Activar'}
                        </button>
                        <button
                          type="button"
                          className={menuButtonOff}
                          onClick={() => {
                            setResetId(resetting ? null : row.id);
                            setResetPassword('');
                            setError(null);
                          }}
                        >
                          {resetting ? 'Cerrar' : 'Contraseña'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {canManage && resetting ? (
                    <div className="flex flex-wrap items-end justify-end gap-2">
                      <label className="block min-w-[12rem] flex-1 text-sm">
                        <span className="text-slate-600">Nueva contraseña</span>
                        <PasswordInput
                          className="pv-input text-sm"
                          wrapperClassName="mt-1"
                          placeholder="Mínimo 8"
                          value={resetPassword}
                          onChange={(e) => setResetPassword(e.target.value)}
                          autoComplete="new-password"
                        />
                      </label>
                      <button
                        type="button"
                        className={menuAction}
                        disabled={savingPassword}
                        onClick={() => void setStaffPassword(row.id)}
                      >
                        {savingPassword ? 'Guardando…' : 'Guardar clave'}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {canManage ? (
            <div className="min-w-0 rounded-xl bg-slate-50 p-4">
              <h3 className="font-medium text-slate-900">Nuevo usuario</h3>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="block min-w-[12rem] flex-1 text-sm">
                  <span className="text-slate-600">Nombre</span>
                  <input
                    placeholder="Nombre"
                    className="pv-input mt-1 text-sm"
                    value={staffForm.fullName}
                    onChange={(e) => setStaffForm((f) => ({ ...f, fullName: e.target.value }))}
                  />
                </label>
                <label className="block min-w-[12rem] flex-1 text-sm">
                  <span className="text-slate-600">Usuario</span>
                  <input
                    type="email"
                    placeholder="Correo"
                    className="pv-input mt-1 text-sm"
                    value={staffForm.email}
                    onChange={(e) => setStaffForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </label>
                <label className="block min-w-[12rem] flex-1 text-sm">
                  <span className="text-slate-600">Contraseña</span>
                  <PasswordInput
                    placeholder="Mínimo 8"
                    className="pv-input text-sm"
                    wrapperClassName="mt-1"
                    value={staffForm.password}
                    onChange={(e) => setStaffForm((f) => ({ ...f, password: e.target.value }))}
                  />
                </label>
                <label className="block w-[11.5rem] shrink-0 text-sm">
                  <span className="text-slate-600">Rol</span>
                  <select
                    className="pv-input mt-1 block text-sm"
                    value={staffForm.role}
                    onChange={(e) => setStaffForm((f) => ({ ...f, role: e.target.value as StaffRole }))}
                  >
                    {STAFF_ROLES.filter((r) => r !== 'owner').map((role) => (
                      <option key={role} value={role}>
                        {STAFF_ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={menuAction}
                  disabled={savingStaff}
                  onClick={() => void createStaff()}
                >
                  {savingStaff ? 'Creando…' : 'Crear usuario'}
                </button>
              </div>
            </div>
          ) : null}
        </details>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
