import type { SupabaseClient } from '@supabase/supabase-js';

import type { OrderStatus } from '@puertaverde/shared';
import {
  buildInboundHelpMessage,
  buildInboundOptInMessage,
  buildInboundOptOutMessage,
  buildInboundOptedOutNotice,
  buildInboundOrderLookupMessage,
  buildInboundOrdersMessage,
  buildInboundPromosMessage,
  buildInboundStoreLinkMessage,
  buildInboundUnknownMessage,
  detectInboundIntent,
  sendTextMessage,
  type InboundWhatsAppMessage,
} from '@puertaverde/whatsapp';

interface BranchContext {
  id: string;
  name: string;
  slug: string;
}

interface HandlerContext {
  supabase: SupabaseClient;
  organizationId: string;
  branch: BranchContext;
  storeUrl: string;
  whatsappToken: string;
  phoneNumberId: string;
}

async function logMessage(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    phone: string;
    body: string;
    direction: 'inbound' | 'outbound';
    templateKey: string;
    externalMessageId?: string | null;
    orderId?: string | null;
    status?: string;
    errorMessage?: string | null;
  },
) {
  await supabase.from('whatsapp_message_logs').insert({
    organization_id: input.organizationId,
    order_id: input.orderId ?? null,
    recipient_phone: input.phone,
    template_key: input.templateKey,
    body: input.body,
    external_message_id: input.externalMessageId ?? null,
    status: input.status ?? 'received',
    error_message: input.errorMessage ?? null,
    direction: input.direction,
  });
}

async function sendReply(
  ctx: HandlerContext,
  to: string,
  body: string,
  templateKey: string,
  orderId?: string | null,
) {
  const result = await sendTextMessage(
    { phoneNumberId: ctx.phoneNumberId, accessToken: ctx.whatsappToken },
    { to, body },
  );

  await logMessage(ctx.supabase, {
    organizationId: ctx.organizationId,
    phone: to,
    body,
    direction: 'outbound',
    templateKey,
    externalMessageId: result.messageId ?? null,
    orderId,
    status: result.ok ? 'sent' : 'failed',
    errorMessage: result.error ?? null,
  });

  return result;
}

async function getRecentOrders(ctx: HandlerContext, phone: string) {
  const { data } = await ctx.supabase.rpc('get_orders_by_customer_phone', {
    p_organization_id: ctx.organizationId,
    p_phone: phone,
    p_limit: 3,
  });

  return (data ?? []) as Array<{
    id: string;
    order_number: number;
    status: OrderStatus;
    total: number;
    tracking_token: string;
    created_at: string;
    branch_name: string;
    branch_slug: string;
  }>;
}

async function getActivePromos(ctx: HandlerContext) {
  const { data } = await ctx.supabase
    .from('promotions')
    .select('title, body, discount_percent')
    .eq('branch_id', ctx.branch.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(5);

  return (data ?? []) as Array<{
    title: string;
    body: string | null;
    discount_percent: number | null;
  }>;
}

async function buildResponse(
  ctx: HandlerContext,
  phone: string,
  text: string,
  optedIn: boolean,
): Promise<{ body: string; templateKey: string; orderId?: string | null }> {
  const intent = detectInboundIntent(text);
  const storeBase = { storeUrl: ctx.storeUrl, branchSlug: ctx.branch.slug };

  if (!optedIn && intent.type !== 'opt_in' && intent.type !== 'order_status' && intent.type !== 'order_number') {
    return { body: buildInboundOptedOutNotice(), templateKey: 'opt_out_notice' };
  }

  switch (intent.type) {
    case 'help':
      return {
        body: buildInboundHelpMessage({
          ...storeBase,
          branchName: ctx.branch.name,
        }),
        templateKey: 'inbound_help',
      };

    case 'store_link':
      return {
        body: buildInboundStoreLinkMessage({
          ...storeBase,
          branchName: ctx.branch.name,
        }),
        templateKey: 'inbound_store_link',
      };

    case 'opt_out':
      await ctx.supabase.rpc('set_customer_whatsapp_opt_in', {
        p_organization_id: ctx.organizationId,
        p_phone: phone,
        p_opt_in: false,
      });
      return { body: buildInboundOptOutMessage(), templateKey: 'inbound_opt_out' };

    case 'opt_in':
      await ctx.supabase.rpc('set_customer_whatsapp_opt_in', {
        p_organization_id: ctx.organizationId,
        p_phone: phone,
        p_opt_in: true,
      });
      return { body: buildInboundOptInMessage(), templateKey: 'inbound_opt_in' };

    case 'promos': {
      const promos = await getActivePromos(ctx);
      return {
        body: buildInboundPromosMessage({
          promos: promos.map((promo) => ({
            title: promo.title,
            body: promo.body,
            discountPercent: promo.discount_percent,
          })),
          ...storeBase,
        }),
        templateKey: 'inbound_promos',
      };
    }

    case 'order_number': {
      const orders = await getRecentOrders(ctx, phone);
      const match = orders.find((order) => Number(order.order_number) === intent.orderNumber);
      return {
        body: buildInboundOrderLookupMessage({
          found: Boolean(match),
          orderNumber: intent.orderNumber,
          status: match?.status,
          total: match ? Number(match.total) : undefined,
          trackingUrl: match ? `${ctx.storeUrl}/pedido/${match.tracking_token}` : undefined,
          branchName: match?.branch_name,
        }),
        templateKey: 'inbound_order_lookup',
        orderId: match?.id ?? null,
      };
    }

    case 'order_status': {
      const orders = await getRecentOrders(ctx, phone);
      return {
        body: buildInboundOrdersMessage({
          orders: orders.map((order) => ({
            orderNumber: Number(order.order_number),
            status: order.status,
            total: Number(order.total),
            trackingUrl: `${ctx.storeUrl}/pedido/${order.tracking_token}`,
            branchName: order.branch_name,
            createdAt: order.created_at,
          })),
          ...storeBase,
        }),
        templateKey: 'inbound_order_status',
        orderId: orders[0]?.id ?? null,
      };
    }

    default:
      return {
        body: buildInboundUnknownMessage(storeBase),
        templateKey: 'inbound_unknown',
      };
  }
}

export async function resolveOrganizationId(
  supabase: SupabaseClient,
  phoneNumberId: string,
): Promise<string | null> {
  const { data: fromConfig } = await supabase.rpc('resolve_whatsapp_organization', {
    p_phone_number_id: phoneNumberId,
  });

  if (fromConfig) return fromConfig as string;

  const envOrgId = process.env.WHATSAPP_DEFAULT_ORGANIZATION_ID;
  if (envOrgId) return envOrgId;

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('subscription_status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return org?.id ?? null;
}

export async function handleInboundWhatsAppMessage(
  ctx: HandlerContext,
  message: InboundWhatsAppMessage,
) {
  await logMessage(ctx.supabase, {
    organizationId: ctx.organizationId,
    phone: message.from,
    body: message.text,
    direction: 'inbound',
    templateKey: 'inbound_received',
    externalMessageId: message.messageId,
    status: 'received',
  });

  const { data: optedIn } = await ctx.supabase.rpc('get_customer_whatsapp_opt_in', {
    p_organization_id: ctx.organizationId,
    p_phone: message.from,
  });

  const response = await buildResponse(ctx, message.from, message.text, optedIn !== false);
  await sendReply(ctx, message.from, response.body, response.templateKey, response.orderId);
}

export async function handleWhatsAppStatusUpdates(
  supabase: SupabaseClient,
  updates: Array<{ messageId: string; status: string }>,
) {
  for (const update of updates) {
    await supabase
      .from('whatsapp_message_logs')
      .update({ status: update.status })
      .eq('external_message_id', update.messageId);
  }
}
