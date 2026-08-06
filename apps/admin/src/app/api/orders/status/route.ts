import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';
import { buildOrderStatusMessage, sendTextMessage } from '@puertaverde/whatsapp';
import type { OrderStatus } from '@puertaverde/shared';

import { requireStaffApi } from '@/lib/auth';

export async function PATCH(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const { orderId, status } = (await request.json()) as {
      orderId: string;
      status: OrderStatus;
    };

    const supabase = createAdminClient();
    const { data: order, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId)
      .select('id, order_number, customer_phone, tracking_token, organization_id, branch_id')
      .single();

    if (error || !order) {
      return NextResponse.json({ error: error?.message ?? 'Pedido no encontrado' }, { status: 400 });
    }

    const { data: branch } = await supabase
      .from('branches')
      .select('name, slug')
      .eq('id', order.branch_id)
      .single();
    const webUrl = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3001';
    const trackingUrl = `${webUrl}/pedido/${order.tracking_token}`;
    const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (whatsappToken && phoneNumberId && branch) {
      const message = buildOrderStatusMessage({
        orderNumber: Number(order.order_number),
        status,
        branchName: branch.name,
        trackingUrl,
      });

      const result = await sendTextMessage(
        { phoneNumberId, accessToken: whatsappToken },
        { to: order.customer_phone, body: message },
      );

      await supabase.from('whatsapp_message_logs').insert({
        organization_id: order.organization_id,
        order_id: order.id,
        recipient_phone: order.customer_phone,
        template_key: 'order_status',
        body: message,
        external_message_id: result.messageId ?? null,
        status: result.ok ? 'sent' : 'failed',
        error_message: result.error ?? null,
        direction: 'outbound',
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 },
    );
  }
}
