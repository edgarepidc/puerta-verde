import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';
import type { PaymentMethod } from '@puertaverde/shared';

import { requireStaffApi } from '@/lib/auth';

const VALID_METHODS: PaymentMethod[] = ['cash', 'card_terminal', 'transfer'];

export async function PATCH(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await request.json()) as {
      orderId: string;
      paymentMethod?: PaymentMethod | null;
      clear?: boolean;
    };

    const clearPayment = body.clear === true || body.paymentMethod == null;
    if (!clearPayment && !VALID_METHODS.includes(body.paymentMethod as PaymentMethod)) {
      return NextResponse.json({ error: 'Método de pago no válido' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const updates = clearPayment
      ? {
          payment_status: 'pending' as const,
          payment_method: null,
          paid_at: null,
          paid_by: null,
        }
      : {
          payment_status: 'paid' as const,
          payment_method: body.paymentMethod as PaymentMethod,
          paid_at: new Date().toISOString(),
          paid_by: auth.userId,
        };

    const { data: order, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', body.orderId)
      .eq('branch_id', auth.branchId)
      .select('id, payment_status, payment_method')
      .maybeSingle();

    if (error || !order) {
      return NextResponse.json({ error: error?.message ?? 'Pedido no encontrado' }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      paymentStatus: order.payment_status,
      paymentMethod: order.payment_method,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 },
    );
  }
}
