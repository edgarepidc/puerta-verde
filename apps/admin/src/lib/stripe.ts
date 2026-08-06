import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe | null {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return null;

  if (!stripeClient) {
    stripeClient = new Stripe(secret, { apiVersion: '2025-02-24.acacia' });
  }

  return stripeClient;
}

export function getStripePriceId(plan: 'basic' | 'pro'): string | null {
  if (plan === 'basic') return process.env.STRIPE_PRICE_BASIC_MONTHLY ?? null;
  if (plan === 'pro') return process.env.STRIPE_PRICE_PRO_MONTHLY ?? null;
  return null;
}
