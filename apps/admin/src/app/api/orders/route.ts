import { NextResponse } from 'next/server';

import {
  resolvePosCustomer,
  validateGuestCheckout,
  withUnavailableProductNames,
  type GuestCheckoutInput,
  type PaymentMethod,
} from '@puertaverde/shared';
import { createAdminClient, lookupUnavailableProductNames } from '@puertaverde/supabase';
import { buildOrderConfirmationMessage, sendTextMessage } from '@puertaverde/whatsapp';

import { loadPermissionMatrix, requireStaffApi, staffHasPermission } from '@/lib/auth';
import { applyCouponToOrder } from '@/lib/apply-coupon';
import { parseSoldOnDate } from '@/lib/mexico-date';
import { loadOrdersBoard } from '@/lib/orders-board';

const POS_PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card_terminal', 'transfer'];

type PosItem = GuestCheckoutInput['items'][number] & { unitPrice?: number };

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export async function GET() {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const orders = await loadOrdersBoard(auth.branchId, {
      name: auth.branchName,
      slug: auth.branchSlug,
    });
    return NextResponse.json({ orders });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar pedidos' },
      { status: 500 },
    );
  }
}

async function applyPosPriceOverrides(
  supabase: ReturnType<typeof createAdminClient>,
  orderId: string,
  items: PosItem[],
) {
  const overrides = items.filter(
    (item) =>
      item.unitPrice != null &&
      Number.isFinite(Number(item.unitPrice)) &&
      Number(item.unitPrice) >= 0,
  );
  if (overrides.length === 0) return;

  const { data: rows, error } = await supabase
    .from('order_items')
    .select('id, branch_product_id, quantity, unit_price')
    .eq('order_id', orderId);
  if (error) throw new Error(error.message);

  const byBranchProduct = new Map(overrides.map((item) => [item.branchProductId, item]));
  let subtotal = 0;

  for (const row of rows ?? []) {
    const override = byBranchProduct.get(row.branch_product_id);
    const quantity = Number(row.quantity);
    const unitPrice =
      override?.unitPrice != null ? roundMoney(Number(override.unitPrice)) : Number(row.unit_price);
    const lineTotal = roundMoney(unitPrice * quantity);
    subtotal += lineTotal;

    if (override?.unitPrice != null) {
      const { error: itemError } = await supabase
        .from('order_items')
        .update({ unit_price: unitPrice, line_total: lineTotal })
        .eq('id', row.id)
        .eq('order_id', orderId);
      if (itemError) throw new Error(itemError.message);
    }
  }

  const { data: order, error: orderReadError } = await supabase
    .from('orders')
    .select('delivery_fee')
    .eq('id', orderId)
    .single();
  if (orderReadError) throw new Error(orderReadError.message);

  const deliveryFee = Number(order?.delivery_fee ?? 0);
  const { error: orderError } = await supabase
    .from('orders')
    .update({
      subtotal: roundMoney(subtotal),
      total: roundMoney(subtotal + deliveryFee),
    })
    .eq('id', orderId);
  if (orderError) throw new Error(orderError.message);
}

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await request.json()) as Omit<GuestCheckoutInput, 'items'> & {
      paymentMethod?: PaymentMethod;
      markDelivered?: boolean;
      sendWhatsApp?: boolean;
      /** Calendar day YYYY-MM-DD (Mexico City). Defaults to today. */
      soldOn?: string;
      couponCode?: string | null;
      items: PosItem[];
    };

    const customer = resolvePosCustomer(body.customerName ?? '', body.customerPhone ?? '');
    if ('error' in customer) {
      return NextResponse.json({ error: customer.error }, { status: 400 });
    }
    const { customerName, customerPhone, walkIn } = customer;

    const validationError = validateGuestCheckout({
      ...body,
      customerName,
      customerPhone,
      walkIn,
      fulfillmentType: body.fulfillmentType ?? 'pickup',
    });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const paymentMethod = body.paymentMethod ?? 'cash';
    if (!POS_PAYMENT_METHODS.includes(paymentMethod)) {
      return NextResponse.json({ error: 'Método de pago no válido' }, { status: 400 });
    }

    const permissionMatrix = await loadPermissionMatrix(auth.organizationId);
    const canEditPrice = staffHasPermission(auth, 'pos.edit_price', permissionMatrix);

    if (body.items.some((item) => item.unitPrice != null) && !canEditPrice) {
      return NextResponse.json(
        { error: 'No tienes permiso para cambiar el precio de venta' },
        { status: 403 },
      );
    }

    for (const item of body.items) {
      if (item.unitPrice != null) {
        const price = Number(item.unitPrice);
        if (!Number.isFinite(price) || price < 0) {
          return NextResponse.json({ error: 'Precio de venta no válido' }, { status: 400 });
        }
      }
    }

    const soldOn = parseSoldOnDate(body.soldOn);
    if (!soldOn.ok) {
      return NextResponse.json({ error: soldOn.error }, { status: 400 });
    }

    const supabase = createAdminClient();
    const fulfillmentType = body.fulfillmentType ?? 'pickup';
    const userNotes = body.deliveryNotes?.trim() || '';
    const deliveryNotes = userNotes ? `[mostrador] ${userNotes}` : '[mostrador]';

    const { data, error } = await supabase.rpc('place_guest_order', {
      p_branch_slug: auth.branchSlug,
      p_customer_name: customerName.trim(),
      p_customer_phone: customerPhone,
      p_fulfillment_type: fulfillmentType,
      p_unit_id: fulfillmentType === 'delivery' ? (body.unitId ?? null) : null,
      p_delivery_notes: deliveryNotes,
      p_items: body.items.map((item) => ({
        branch_product_id: item.branchProductId,
        quantity: item.quantity,
        ...(item.orderedQuantity != null && item.orderedQuantity > 0
          ? { ordered_quantity: item.orderedQuantity }
          : {}),
      })),
    });

    if (error) {
      const names = await lookupUnavailableProductNames(
        supabase,
        auth.branchId,
        body.items.map((item) => item.branchProductId),
      );
      return NextResponse.json(
        { error: withUnavailableProductNames(error.message, names) },
        { status: 400 },
      );
    }

    const row = data?.[0] as
      | { order_id: string; order_number: number; tracking_token: string; total: number }
      | undefined;

    if (!row?.order_id) {
      return NextResponse.json({ error: 'No se pudo crear el pedido' }, { status: 500 });
    }

    if (canEditPrice) {
      try {
        await applyPosPriceOverrides(supabase, row.order_id, body.items);
      } catch (overrideError) {
        return NextResponse.json(
          {
            error:
              overrideError instanceof Error
                ? overrideError.message
                : 'No se pudo aplicar el precio de venta',
          },
          { status: 400 },
        );
      }
    }

    if (body.couponCode?.trim()) {
      const couponResult = await applyCouponToOrder(supabase, {
        orderId: row.order_id,
        branchId: auth.branchId,
        code: body.couponCode,
      });
      if (!couponResult.ok) {
        return NextResponse.json({ error: couponResult.error }, { status: 400 });
      }
    }

    const updates = {
      payment_status: 'paid' as const,
      payment_method: paymentMethod,
      paid_at: soldOn.iso,
      paid_by: auth.userId,
      source: 'pos' as const,
      created_at: soldOn.iso,
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
          created_at: soldOn.iso,
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
      total: order?.total ?? row.total,
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
