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
