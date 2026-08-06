import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { canManageStaff, requireStaffApi } from '@/lib/auth';
import { getStripe, getStripePriceId } from '@/lib/stripe';

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  if (!canManageStaff(auth.role)) {
    return NextResponse.json({ error: 'Sin permisos para gestionar la suscripción' }, { status: 403 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe no está configurado' }, { status: 400 });
  }

  const { plan } = (await request.json()) as { plan: 'basic' | 'pro' };
  const priceId = getStripePriceId(plan);
  if (!priceId) {
    return NextResponse.json({ error: 'Precio de Stripe no configurado para este plan' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, stripe_customer_id')
    .eq('id', auth.organizationId)
    .single();

  if (!org) {
    return NextResponse.json({ error: 'Organización no encontrada' }, { status: 404 });
  }

  let customerId = org.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: auth.email,
      name: org.name,
      metadata: { organization_id: org.id },
    });
    customerId = customer.id;
    await supabase
      .from('organizations')
      .update({ stripe_customer_id: customerId })
      .eq('id', org.id);
  }

  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3000';
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${adminUrl}/configuracion?billing=success`,
    cancel_url: `${adminUrl}/configuracion?billing=cancel`,
    metadata: {
      organization_id: org.id,
      plan,
    },
    subscription_data: {
      metadata: {
        organization_id: org.id,
        plan,
      },
    },
  });

  return NextResponse.json({ url: session.url });
}
