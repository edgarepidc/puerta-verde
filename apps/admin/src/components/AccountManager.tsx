'use client';

import { useState } from 'react';

import { ActionChip, FoldableSummary } from '@/components/ActionChip';
import { PasswordInput } from '@/components/PasswordInput';

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
            <ActionChip as="span" emoji="✅" elevated={false}>
              Guardado
            </ActionChip>
          ) : undefined
        }
      />

      <div className="grid min-w-0 gap-4 md:grid-cols-4">
        <label className="block text-sm md:col-span-2">
          <span className="font-medium text-slate-700">Nombre</span>
          <input
            className="pv-input mt-1"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
          />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="font-medium text-slate-700">Usuario</span>
          <input
            type="email"
            className="pv-input mt-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
          <span className="mt-1 block text-xs text-slate-500">
            El correo con el que entras al panel.
          </span>
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="font-medium text-slate-700">Contraseña actual</span>
          <PasswordInput
            className="pv-input"
            wrapperClassName="mt-1"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Necesaria si cambias el usuario o la contraseña.
          </span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Contraseña nueva</span>
          <PasswordInput
            className="pv-input"
            wrapperClassName="mt-1"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="Mínimo 8"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Confirmar contraseña</span>
          <PasswordInput
            className="pv-input"
            wrapperClassName="mt-1"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <ActionChip size="lg" tone="emerald" emoji="✅" disabled={saving} onClick={() => void save()}>
        {saving ? 'Guardando…' : 'Guardar acceso'}
      </ActionChip>
    </details>
  );
}
