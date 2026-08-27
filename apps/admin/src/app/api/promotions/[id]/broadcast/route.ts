import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';
import { sendTextMessage } from '@puertaverde/whatsapp';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';

function buildPromoBroadcastMessage(input: {
  title: string;
  body: string | null;
  discountPercent: number | null;
  storeUrl: string;
}): string {
  const lines = [`*${input.title}* 🎉`];
  if (input.body) lines.push(input.body);
  if (input.discountPercent && input.discountPercent > 0) {
    lines.push(`Descuento: ${input.discountPercent}%`);
  }
  lines.push('', `Pide aquí: ${input.storeUrl}`);
  return lines.join('\n');
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'promotions.manage',
    'No tienes permiso para gestionar promociones',
  );
  if (denied) return denied;

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: promo, error } = await supabase
    .from('promotions')
    .select('id, title, body, discount_percent, branch_id, is_active')
    .eq('id', id)
    .maybeSingle();

  if (error || !promo) {
    return NextResponse.json({ error: 'Promoción no encontrada' }, { status: 404 });
  }

  if (promo.branch_id !== auth.branchId) {
    return NextResponse.json({ error: 'Promoción de otra sucursal' }, { status: 403 });
  }

  const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!whatsappToken || !phoneNumberId) {
    return NextResponse.json(
      { error: 'WhatsApp no está configurado. Agrega las variables de entorno primero.' },
      { status: 400 },
    );
  }

  const { data: customers } = await supabase
    .from('customers')
    .select('phone')
    .eq('organization_id', auth.organizationId)
    .eq('whatsapp_opt_in', true)
    .limit(100);

  const phones = [...new Set((customers ?? []).map((row: { phone: string }) => row.phone))];
  if (phones.length === 0) {
    return NextResponse.json(
      { error: 'No hay clientes suscritos a WhatsApp para enviar la promo.' },
      { status: 400 },
    );
  }

  const webUrl = process.env.NEXT_PUBLIC_WEB_URL ?? 'https://puerta-verde-web.vercel.app';
  const message = buildPromoBroadcastMessage({
    title: promo.title,
    body: promo.body,
    discountPercent: promo.discount_percent ? Number(promo.discount_percent) : null,
    storeUrl: `${webUrl}/${auth.branchSlug}`,
  });

  let sent = 0;
  let failed = 0;

  for (const phone of phones) {
    const result = await sendTextMessage(
      { phoneNumberId, accessToken: whatsappToken },
      { to: phone, body: message },
    );

    await supabase.from('whatsapp_message_logs').insert({
      organization_id: auth.organizationId,
      recipient_phone: phone,
      template_key: 'promo_broadcast',
      body: message,
      external_message_id: result.messageId ?? null,
      status: result.ok ? 'sent' : 'failed',
      error_message: result.error ?? null,
      direction: 'outbound',
    });

    if (result.ok) sent += 1;
    else failed += 1;
  }

  return NextResponse.json({
    ok: true,
    audience: phones.length,
    sent,
    failed,
  });
}
