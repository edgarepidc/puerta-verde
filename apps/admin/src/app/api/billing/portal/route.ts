import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { getStripe } from '@/lib/stripe';

export async function POST() {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(auth, 'staff.manage', 'Sin permisos');
  if (denied) return denied;

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe no está configurado' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', auth.organizationId)
    .single();

  if (!org?.stripe_customer_id) {
    return NextResponse.json({ error: 'Aún no tienes una suscripción activa en Stripe' }, { status: 400 });
  }

  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3000';
  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${adminUrl}/configuracion`,
  });

  return NextResponse.json({ url: session.url });
}
