import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';
import type { PaymentMethod } from '@puertaverde/shared';

export async function PATCH(request: Request) {
  try {
    const { orderId, paymentMethod } = (await request.json()) as {
      orderId: string;
      paymentMethod: PaymentMethod;
    };

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('orders')
      .update({
        payment_status: 'paid',
        payment_method: paymentMethod,
        paid_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 },
    );
  }
}
