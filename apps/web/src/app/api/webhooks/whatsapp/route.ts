import { NextResponse } from 'next/server';

import { verifyWebhook } from '@puertaverde/whatsapp';

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
  const payload = await request.json();
  // TODO: handle inbound WhatsApp messages (order status replies, opt-out, etc.)
  console.log('WhatsApp webhook event', JSON.stringify(payload));
  return NextResponse.json({ received: true });
}
