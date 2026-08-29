'use client';

import { useState } from 'react';

import {
  PLAN_LABELS,
  PLAN_PRICES_MXN,
  STATUS_LABELS,
  daysUntilTrialEnd,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from '@puertaverde/shared';

import { ActionChip, FoldableSummary } from '@/components/ActionChip';

export function BillingManager({
  organization,
  canManage,
}: {
  organization: {
    name: string;
    subscription_plan: SubscriptionPlan;
    subscription_status: SubscriptionStatus;
    trial_ends_at: string | null;
    stripe_customer_id: string | null;
  };
  canManage: boolean;
}) {
  const [loading, setLoading] = useState<'basic' | 'pro' | 'portal' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const trialDays = daysUntilTrialEnd(organization.trial_ends_at);

  async function startCheckout(plan: 'basic' | 'pro') {
    setLoading(plan);
    setError(null);
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo iniciar el pago');
      if (payload.url) window.location.href = payload.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      setLoading(null);
    }
  }

  async function openPortal() {
    setLoading('portal');
    setError(null);
    try {
      const response = await fetch('/api/billing/portal', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo abrir el portal');
      if (payload.url) window.location.href = payload.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      setLoading(null);
    }
  }

  const trialHint =
    trialDays !== null && organization.subscription_status === 'trialing'
      ? ` · ${trialDays} días de prueba`
      : '';

  return (
    <details
      className="group pv-glass-card min-w-0 space-y-4 overflow-hidden p-4 sm:p-6"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <FoldableSummary
        title="Suscripción"
        hint={`${PLAN_LABELS[organization.subscription_plan]} · ${STATUS_LABELS[organization.subscription_status]}${trialHint}`}
        emoji="💳"
        iconClass="bg-amber-100"
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {canManage ? (
        <div className="grid gap-4 md:grid-cols-2">
          {(['basic', 'pro'] as const).map((plan) => (
            <div key={plan} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
              <h3 className="font-semibold text-slate-900">{PLAN_LABELS[plan]}</h3>
              <p className="mt-1 text-2xl font-bold text-emerald-800">
                ${PLAN_PRICES_MXN[plan]}
                <span className="text-sm font-normal text-slate-500">/mes</span>
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {plan === 'basic'
                  ? '1 sucursal, tienda web y panel admin.'
                  : 'Multi-sucursal, reportes avanzados y soporte prioritario.'}
              </p>
              <ActionChip
                className="mt-4"
                tone={organization.subscription_plan === plan ? 'slate' : 'emerald'}
                emoji={organization.subscription_plan === plan ? '✅' : '💳'}
                disabled={loading !== null || organization.subscription_plan === plan}
                onClick={() => void startCheckout(plan)}
              >
                {loading === plan
                  ? 'Redirigiendo…'
                  : organization.subscription_plan === plan
                    ? 'Plan actual'
                    : 'Elegir plan'}
              </ActionChip>
            </div>
          ))}
        </div>
      ) : null}

      {canManage && organization.stripe_customer_id ? (
        <ActionChip emoji="🧾" disabled={loading !== null} onClick={() => void openPortal()}>
          {loading === 'portal' ? 'Abriendo…' : 'Administrar facturación'}
        </ActionChip>
      ) : null}
    </details>
  );
}
