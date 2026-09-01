import { NextResponse } from 'next/server';

import {
  isCollectedPaymentMethod,
  isPosPaymentMethod,
  type PosPaymentMethod,
} from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { loadPermissionMatrix, requireStaffApi, staffHasPermission } from '@/lib/auth';

export async function PATCH(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const { orderId, paymentMethod } = (await request.json()) as {
      orderId: string;
      paymentMethod: PosPaymentMethod;
    };

    if (!isPosPaymentMethod(paymentMethod)) {
      return NextResponse.json({ error: 'Método de pago no válido' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: current, error: loadError } = await supabase
      .from('orders')
      .select('id, payment_status, payment_method, paid_at, paid_by')
      .eq('id', orderId)
      .eq('branch_id', auth.branchId)
      .maybeSingle();

    if (loadError || !current) {
      return NextResponse.json({ error: loadError?.message ?? 'Pedido no encontrado' }, { status: 400 });
    }

    const currentlyPaid = current.payment_status === 'paid' && current.payment_method !== 'on_account';
    const collecting = isCollectedPaymentMethod(paymentMethod);
    const changingPaidMethod = currentlyPaid && collecting && current.payment_method !== paymentMethod;
    const markingUnpaid = paymentMethod === 'on_account';

    if (changingPaidMethod || markingUnpaid) {
      const matrix = await loadPermissionMatrix(auth.organizationId);
      if (!staffHasPermission(auth, 'orders.edit_payment', matrix)) {
        return NextResponse.json(
          { error: 'Solo una administradora puede cambiar la forma de pago' },
          { status: 403 },
        );
      }
    }

    const now = new Date().toISOString();
    const updates = markingUnpaid
      ? {
          payment_status: 'pending' as const,
          payment_method: 'on_account' as const,
          paid_at: null,
          paid_by: null,
        }
      : {
          payment_status: 'paid' as const,
          payment_method: paymentMethod,
          paid_at: currentlyPaid ? (current.paid_at ?? now) : now,
          paid_by: currentlyPaid ? (current.paid_by ?? auth.userId) : auth.userId,
        };

    const { data: order, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', orderId)
      .eq('branch_id', auth.branchId)
      .select('id, payment_status, payment_method')
      .maybeSingle();

    if (error || !order) {
      return NextResponse.json({ error: error?.message ?? 'Pedido no encontrado' }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      payment_status: order.payment_status,
      payment_method: order.payment_method,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 },
    );
  }
}
