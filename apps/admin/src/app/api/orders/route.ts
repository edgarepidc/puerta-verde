import { NextResponse } from 'next/server';

import {
  validateGuestCheckout,
  type GuestCheckoutInput,
  type PaymentMethod,
} from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';

const POS_PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card_terminal', 'transfer'];

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await request.json()) as GuestCheckoutInput & {
      paymentMethod?: PaymentMethod;
      markDelivered?: boolean;
    };

    const validationError = validateGuestCheckout({
      ...body,
      fulfillmentType: body.fulfillmentType ?? 'pickup',
    });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const paymentMethod = body.paymentMethod ?? 'cash';
    if (!POS_PAYMENT_METHODS.includes(paymentMethod)) {
      return NextResponse.json({ error: 'Método de pago no válido' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const fulfillmentType = body.fulfillmentType ?? 'pickup';

    const { data, error } = await supabase.rpc('place_guest_order', {
      p_branch_slug: auth.branchSlug,
      p_customer_name: body.customerName.trim(),
      p_customer_phone: body.customerPhone,
      p_fulfillment_type: fulfillmentType,
      p_unit_id: fulfillmentType === 'delivery' ? (body.unitId ?? null) : null,
      p_delivery_notes: body.deliveryNotes?.trim() || null,
      p_items: body.items.map((item) => ({
        branch_product_id: item.branchProductId,
        quantity: item.quantity,
      })),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const row = data?.[0] as
      | { order_id: string; order_number: number; tracking_token: string; total: number }
      | undefined;

    if (!row?.order_id) {
      return NextResponse.json({ error: 'No se pudo crear el pedido' }, { status: 500 });
    }

    const updates = {
      payment_status: 'paid' as const,
      payment_method: paymentMethod,
      paid_at: new Date().toISOString(),
      paid_by: auth.userId,
      ...(body.markDelivered !== false ? { status: 'delivered' as const } : {}),
    };

    const { error: updateError } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', row.order_id)
      .eq('branch_id', auth.branchId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    const { data: order } = await supabase
      .from('orders')
      .select(`
        id,
        branch_id,
        order_number,
        customer_name,
        customer_phone,
        status,
        fulfillment_type,
        total,
        payment_status,
        payment_method,
        created_at
      `)
      .eq('id', row.order_id)
      .single();

    return NextResponse.json({
      order,
      orderId: row.order_id,
      orderNumber: row.order_number,
      total: row.total,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al registrar venta' },
      { status: 500 },
    );
  }
}
