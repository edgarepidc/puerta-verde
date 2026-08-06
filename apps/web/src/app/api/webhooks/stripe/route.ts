import { NextResponse } from 'next/server';
import type Stripe from 'stripe';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { getStripe } from '@/lib/stripe';

function mapSubscriptionStatus(status: Stripe.Subscription.Status): 'active' | 'past_due' | 'cancelled' | 'trialing' {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    default:
      return 'cancelled';
  }
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const organizationId = subscription.metadata.organization_id;
  if (!organizationId) return;

  const plan = (subscription.metadata.plan as 'basic' | 'pro' | undefined) ?? 'basic';
  const supabase = createAdminClient();

  await supabase
    .from('organizations')
    .update({
      stripe_subscription_id: subscription.id,
      subscription_plan: plan,
      subscription_status: mapSubscriptionStatus(subscription.status),
    })
    .eq('id', organizationId);
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const supabase = createAdminClient();

  if (session.mode === 'subscription') {
    const organizationId = session.metadata?.organization_id;
    const plan = (session.metadata?.plan as 'basic' | 'pro' | undefined) ?? 'basic';
    if (!organizationId) return;

    await supabase
      .from('organizations')
      .update({
        stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null,
        stripe_subscription_id: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null,
        subscription_plan: plan,
        subscription_status: 'active',
      })
      .eq('id', organizationId);
    return;
  }

  if (session.mode === 'payment') {
    const orderId = session.metadata?.order_id;
    if (!orderId) return;

    await supabase
      .from('orders')
      .update({
        payment_status: 'paid',
        payment_method: 'online',
        paid_at: new Date().toISOString(),
        stripe_checkout_session_id: session.id,
      })
      .eq('id', orderId);
  }
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe webhook not configured' }, { status: 400 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
