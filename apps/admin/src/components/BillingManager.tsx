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

  return (
    <section className="pv-glass-card p-6">
      <h2 className="text-lg font-semibold text-slate-900">Suscripción</h2>
      <p className="mt-1 text-sm text-slate-500">
        Plan actual: <strong>{PLAN_LABELS[organization.subscription_plan]}</strong> ·{' '}
        {STATUS_LABELS[organization.subscription_status]}
        {trialDays !== null && organization.subscription_status === 'trialing' && (
          <> · {trialDays} días de prueba restantes</>
        )}
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {canManage && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {(['basic', 'pro'] as const).map((plan) => (
            <div key={plan} className="pv-glass-item rounded-xl p-4">
              <h3 className="font-semibold text-slate-900">{PLAN_LABELS[plan]}</h3>
              <p className="mt-1 text-2xl font-bold text-[var(--pv-green-800)]">
                ${PLAN_PRICES_MXN[plan]}
                <span className="text-sm font-normal text-slate-500">/mes</span>
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {plan === 'basic'
                  ? '1 sucursal, tienda web y panel admin.'
                  : 'Multi-sucursal, reportes avanzados y soporte prioritario.'}
              </p>
              <button
                type="button"
                disabled={loading !== null || organization.subscription_plan === plan}
                onClick={() => startCheckout(plan)}
                className="pv-btn-primary mt-4 px-4 py-2 text-sm disabled:opacity-50"
              >
                {loading === plan ? 'Redirigiendo...' : organization.subscription_plan === plan ? 'Plan actual' : 'Elegir plan'}
              </button>
            </div>
          ))}
        </div>
      )}

      {canManage && organization.stripe_customer_id && (
        <button
          type="button"
          disabled={loading !== null}
          onClick={openPortal}
          className="pv-btn-secondary mt-4 px-4 py-2 text-sm"
        >
          {loading === 'portal' ? 'Abriendo...' : 'Administrar facturación en Stripe'}
        </button>
      )}
    </section>
  );
}
