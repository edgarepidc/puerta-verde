import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';
import type { PaymentMethod } from '@puertaverde/shared';

import { requireStaffApi } from '@/lib/auth';

const VALID_METHODS: PaymentMethod[] = ['cash', 'card_terminal', 'transfer'];

export async function PATCH(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const { orderId, paymentMethod } = (await request.json()) as {
      orderId: string;
      paymentMethod: PaymentMethod;
    };

    if (!VALID_METHODS.includes(paymentMethod)) {
      return NextResponse.json({ error: 'Método de pago no válido' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: order, error } = await supabase
      .from('orders')
      .update({
        payment_status: 'paid',
        payment_method: paymentMethod,
        paid_at: new Date().toISOString(),
        paid_by: auth.userId,
      })
      .eq('id', orderId)
      .eq('branch_id', auth.branchId)
      .select('id')
      .maybeSingle();

    if (error || !order) {
      return NextResponse.json({ error: error?.message ?? 'Pedido no encontrado' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 },
    );
  }
}
