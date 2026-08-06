import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { getStripe } from '@/lib/stripe';

export async function POST(request: Request) {
  try {
    const { trackingToken } = (await request.json()) as { trackingToken: string };
    if (!trackingToken) {
      return NextResponse.json({ error: 'Token de pedido requerido' }, { status: 400 });
    }

    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json({ error: 'Pagos en línea no disponibles' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: orderRows } = await supabase.rpc('get_order_by_tracking_token', {
      p_token: trackingToken,
    });
    const order = orderRows?.[0];
    if (!order) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }

    if (order.payment_status === 'paid') {
      return NextResponse.json({ error: 'Este pedido ya está pagado' }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
    const amountCents = Math.round(Number(order.total) * 100);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'mxn',
            unit_amount: amountCents,
            product_data: {
              name: `Pedido #${order.order_number} · ${order.branch_name}`,
              description: 'Puerta Verde — pago en línea',
            },
          },
        },
      ],
      metadata: {
        order_id: order.id,
        tracking_token: trackingToken,
      },
      success_url: `${appUrl}/pedido/${trackingToken}?paid=1`,
      cancel_url: `${appUrl}/pedido/${trackingToken}?paid=0`,
    });

    await supabase
      .from('orders')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', order.id);

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 },
    );
  }
}
