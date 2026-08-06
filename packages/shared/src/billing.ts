export const SUBSCRIPTION_PLANS = ['basic', 'pro', 'enterprise'] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

export const SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due', 'cancelled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  basic: 'Básico',
  pro: 'Pro',
  enterprise: 'Empresa',
};

export const PLAN_PRICES_MXN: Record<SubscriptionPlan, number> = {
  basic: 499,
  pro: 899,
  enterprise: 1499,
};

export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trialing: 'Prueba gratis',
  active: 'Activo',
  past_due: 'Pago pendiente',
  cancelled: 'Cancelado',
};

export function isSubscriptionUsable(status: SubscriptionStatus, trialEndsAt?: string | null): boolean {
  if (status === 'active' || status === 'trialing') {
    if (status === 'trialing' && trialEndsAt) {
      return new Date(trialEndsAt).getTime() > Date.now();
    }
    return true;
  }
  return false;
}

export function daysUntilTrialEnd(trialEndsAt: string | null | undefined): number | null {
  if (!trialEndsAt) return null;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}
