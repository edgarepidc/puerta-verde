import { NextResponse } from 'next/server';

import { normalizePhone } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';
import {
  buildOrderConfirmationMessage,
  sendTextMessage,
} from '@puertaverde/whatsapp';

import { resolveDeliveryUnitId } from '@/lib/resolve-delivery-unit';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();

    const { data: branch, error: branchError } = await supabase
      .from('branches')
      .select('id, name, organization_id')
      .eq('slug', body.branchSlug)
      .single();

    if (branchError || !branch) {
      return NextResponse.json({ error: 'Sucursal no encontrada' }, { status: 400 });
    }

    const deliveryUnitLabel =
      typeof body.deliveryUnit === 'string' ? body.deliveryUnit.trim() : '';
    let unitId: string | null = body.unitId ?? null;

    if (body.fulfillmentType === 'delivery') {
      if (!deliveryUnitLabel && !unitId) {
        return NextResponse.json(
          { error: 'Ingresa tu departamento para la entrega.' },
          { status: 400 },
        );
      }
      if (deliveryUnitLabel) {
        unitId = await resolveDeliveryUnitId(supabase, branch.id, deliveryUnitLabel);
      }
    } else {
      unitId = null;
    }

    const items = Array.isArray(body.items)
      ? body.items.map((item: { branchProductId?: string; branch_product_id?: string; quantity: number }) => ({
          branch_product_id: item.branch_product_id ?? item.branchProductId,
          quantity: item.quantity,
        }))
      : [];

    const { data, error } = await supabase.rpc('place_guest_order', {
      p_branch_slug: body.branchSlug,
      p_customer_name: body.customerName,
      p_customer_phone: body.customerPhone,
      p_fulfillment_type: body.fulfillmentType,
      p_unit_id: unitId,
      p_delivery_notes: body.deliveryNotes ?? null,
      p_items: items,
    });

    if (error || !data?.[0]) {
      return NextResponse.json({ error: error?.message ?? 'No se pudo crear el pedido' }, { status: 400 });
    }

    const order = data[0];

    if (deliveryUnitLabel) {
      await supabase
        .from('orders')
        .update({ delivery_unit_label: deliveryUnitLabel })
        .eq('id', order.order_id);

      await supabase
        .from('customers')
        .update({ default_delivery_label: deliveryUnitLabel })
        .eq('organization_id', branch.organization_id)
        .eq('phone', normalizePhone(String(body.customerPhone ?? '')));
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
    const trackingUrl = `${appUrl}/pedido/${order.tracking_token}`;

    const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (whatsappToken && phoneNumberId) {
      const message = buildOrderConfirmationMessage({
        orderNumber: Number(order.order_number),
        customerName: body.customerName,
        total: Number(order.total),
        trackingUrl,
        branchName: branch.name,
      });

      const result = await sendTextMessage(
        { phoneNumberId, accessToken: whatsappToken },
        { to: body.customerPhone, body: message },
      );

      await supabase.from('whatsapp_message_logs').insert({
        organization_id: branch.organization_id,
        order_id: order.order_id,
        recipient_phone: body.customerPhone,
        template_key: 'order_confirmation',
        body: message,
        external_message_id: result.messageId ?? null,
        status: result.ok ? 'sent' : 'failed',
        error_message: result.error ?? null,
        direction: 'outbound',
      });
    }

    return NextResponse.json({
      orderId: order.order_id,
      orderNumber: order.order_number,
      trackingToken: order.tracking_token,
      total: order.total,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 },
    );
  }
}
