'use client';

import { useState } from 'react';

import { FoldableSummary } from '@/components/ActionChip';
import { PasswordInput } from '@/components/PasswordInput';

const menuButtonOff =
  'rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800';
const menuAction = 'pv-btn-account px-5 py-2.5 text-sm';

export function AccountManager({
  initialEmail,
  initialFullName,
}: {
  initialEmail: string;
  initialFullName: string | null;
}) {
  const [open, setOpen] = useState(true);
  const [fullName, setFullName] = useState(initialFullName ?? '');
  const [email, setEmail] = useState(initialEmail);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    if (newPassword && newPassword !== confirmPassword) {
      setError('La contraseña nueva y la confirmación no coinciden');
      setSaving(false);
      return;
    }
    try {
      const response = await fetch('/api/auth/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email,
          currentPassword,
          newPassword,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo guardar');
      setEmail(payload.email ?? email);
      setFullName(payload.fullName ?? fullName);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
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
        title="Tu acceso"
        hint="Nombre, usuario y contraseña para entrar al panel"
        emoji="🔑"
        iconClass="bg-sky-100"
        actions={
          saved ? (
            <span className={menuButtonOff}>Guardado</span>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-[12rem] flex-1 text-sm">
          <span className="text-slate-600">Nombre</span>
          <input
            className="pv-input mt-1 text-sm"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
          />
        </label>
        <label className="block min-w-[12rem] flex-1 text-sm">
          <span className="text-slate-600">Usuario</span>
          <input
            type="email"
            className="pv-input mt-1 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="block min-w-[12rem] flex-1 text-sm">
          <span className="text-slate-600">Contraseña actual</span>
          <PasswordInput
            className="pv-input text-sm"
            wrapperClassName="mt-1"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <label className="block min-w-[12rem] flex-1 text-sm">
          <span className="text-slate-600">Contraseña nueva</span>
          <PasswordInput
            className="pv-input text-sm"
            wrapperClassName="mt-1"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="Mínimo 8"
          />
        </label>
        <label className="block min-w-[12rem] flex-1 text-sm">
          <span className="text-slate-600">Confirmar contraseña</span>
          <PasswordInput
            className="pv-input text-sm"
            wrapperClassName="mt-1"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <button type="button" className={menuAction} disabled={saving} onClick={() => void save()}>
          {saving ? 'Guardando…' : 'Guardar acceso'}
        </button>
      </div>
      <p className="text-xs text-slate-500">
        El usuario es el correo con el que entras. La contraseña actual hace falta si cambias el usuario o la contraseña.
      </p>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </details>
  );
}
