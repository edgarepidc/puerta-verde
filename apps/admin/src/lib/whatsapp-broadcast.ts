import { createAdminClient } from '@puertaverde/supabase/admin';
import { sendTextMessage } from '@puertaverde/whatsapp';

export async function broadcastTextToOptInCustomers(input: {
  organizationId: string;
  body: string;
  templateKey: string;
}): Promise<{ audience: number; sent: number; failed: number } | { error: string; status: number }> {
  const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!whatsappToken || !phoneNumberId) {
    return {
      error: 'WhatsApp no está configurado. Agrega las variables de entorno primero.',
      status: 400,
    };
  }

  const supabase = createAdminClient();
  const { data: customers } = await supabase
    .from('customers')
    .select('phone')
    .eq('organization_id', input.organizationId)
    .eq('whatsapp_opt_in', true)
    .limit(100);

  const phones = [...new Set((customers ?? []).map((row: { phone: string }) => row.phone))];
  if (phones.length === 0) {
    return { error: 'No hay clientes suscritos a WhatsApp para enviar el aviso.', status: 400 };
  }

  let sent = 0;
  let failed = 0;

  for (const phone of phones) {
    const result = await sendTextMessage(
      { phoneNumberId, accessToken: whatsappToken },
      { to: phone, body: input.body },
    );

    await supabase.from('whatsapp_message_logs').insert({
      organization_id: input.organizationId,
      recipient_phone: phone,
      template_key: input.templateKey,
      body: input.body,
      external_message_id: result.messageId ?? null,
      status: result.ok ? 'sent' : 'failed',
      error_message: result.error ?? null,
      direction: 'outbound',
    });

    if (result.ok) sent += 1;
    else failed += 1;
  }

  return { audience: phones.length, sent, failed };
}
