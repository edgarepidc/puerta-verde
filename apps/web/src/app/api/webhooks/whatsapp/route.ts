import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';
import {
  parseInboundMessages,
  parseStatusUpdates,
  verifyWebhook,
  verifyWebhookSignature,
} from '@puertaverde/whatsapp';

import {
  handleInboundWhatsAppMessage,
  handleWhatsAppStatusUpdates,
  resolveOrganizationId,
} from '@/lib/whatsapp/inbound-handler';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN ?? 'puerta-verde-dev';

  const result = verifyWebhook(mode, token, challenge, verifyToken);
  if (result) {
    return new NextResponse(result, { status: 200 });
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (appSecret) {
    const signature = request.headers.get('x-hub-signature-256');
    if (!verifyWebhookSignature(rawBody, signature, appSecret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const defaultPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!whatsappToken || !defaultPhoneNumberId) {
    return NextResponse.json({ received: true, skipped: 'whatsapp_not_configured' });
  }

  const supabase = createAdminClient();
  const storeUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://puerta-verde-web.vercel.app';

  const statusUpdates = parseStatusUpdates(payload);
  if (statusUpdates.length > 0) {
    await handleWhatsAppStatusUpdates(
      supabase,
      statusUpdates.map((update) => ({ messageId: update.messageId, status: update.status })),
    );
  }

  const inboundMessages = parseInboundMessages(payload);
  for (const message of inboundMessages) {
    const phoneNumberId = message.phoneNumberId || defaultPhoneNumberId;
    const organizationId = await resolveOrganizationId(supabase, phoneNumberId);
    if (!organizationId) continue;

    const { data: branch } = await supabase
      .from('branches')
      .select('id, name, slug')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!branch) continue;

    await handleInboundWhatsAppMessage(
      {
        supabase,
        organizationId,
        branch,
        storeUrl,
        whatsappToken,
        phoneNumberId,
      },
      message,
    );
  }

  return NextResponse.json({ received: true });
}
