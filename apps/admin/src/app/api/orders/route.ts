import { NextResponse } from 'next/server';

import {
  validateGuestCheckout,
  type GuestCheckoutInput,
  type PaymentMethod,
} from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';
import { buildOrderConfirmationMessage, sendTextMessage } from '@puertaverde/whatsapp';

import { requireStaffApi } from '@/lib/auth';

const POS_PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card_terminal', 'transfer'];

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await request.json()) as GuestCheckoutInput & {
      paymentMethod?: PaymentMethod;
      markDelivered?: boolean;
      sendWhatsApp?: boolean;
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
    const userNotes = body.deliveryNotes?.trim() || '';
    const deliveryNotes = userNotes ? `[mostrador] ${userNotes}` : '[mostrador]';

    const { data, error } = await supabase.rpc('place_guest_order', {
      p_branch_slug: auth.branchSlug,
      p_customer_name: body.customerName.trim(),
      p_customer_phone: body.customerPhone,
      p_fulfillment_type: fulfillmentType,
      p_unit_id: fulfillmentType === 'delivery' ? (body.unitId ?? null) : null,
      p_delivery_notes: deliveryNotes,
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
      source: 'pos' as const,
      ...(body.markDelivered !== false ? { status: 'delivered' as const } : {}),
    };

    const { error: updateError } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', row.order_id)
      .eq('branch_id', auth.branchId);

    if (updateError) {
      await supabase
        .from('orders')
        .update({
          payment_status: 'paid',
          payment_method: paymentMethod,
          paid_at: updates.paid_at,
          paid_by: auth.userId,
          ...(body.markDelivered !== false ? { status: 'delivered' as const } : {}),
        })
        .eq('id', row.order_id)
        .eq('branch_id', auth.branchId);
    }

    const [{ data: order }, { data: items }] = await Promise.all([
      supabase
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
          tracking_token,
          created_at
        `)
        .eq('id', row.order_id)
        .single(),
      supabase
        .from('order_items')
        .select('id, product_name, unit, quantity, unit_price, line_total')
        .eq('order_id', row.order_id),
    ]);

    let whatsappSent = false;
    const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const webUrl = process.env.NEXT_PUBLIC_WEB_URL ?? 'https://puertaverde.com.mx';

    if (body.sendWhatsApp !== false && whatsappToken && phoneNumberId && order) {
      const message = buildOrderConfirmationMessage({
        orderNumber: Number(order.order_number),
        customerName: order.customer_name,
        total: Number(order.total),
        trackingUrl: `${webUrl}/pedido/${order.tracking_token}`,
        branchName: auth.branchName,
      });
      const result = await sendTextMessage(
        { phoneNumberId, accessToken: whatsappToken },
        { to: order.customer_phone, body: message },
      );
      whatsappSent = result.ok;
      await supabase.from('whatsapp_message_logs').insert({
        organization_id: auth.organizationId,
        order_id: order.id,
        recipient_phone: order.customer_phone,
        template_key: 'order_confirmation',
        body: message,
        external_message_id: result.messageId ?? null,
        status: result.ok ? 'sent' : 'failed',
        error_message: result.error ?? null,
        direction: 'outbound',
      });
    }

    return NextResponse.json({
      order,
      items: items ?? [],
      orderId: row.order_id,
      orderNumber: row.order_number,
      total: row.total,
      trackingToken: row.tracking_token,
      whatsappSent,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al registrar venta' },
      { status: 500 },
    );
  }
}
