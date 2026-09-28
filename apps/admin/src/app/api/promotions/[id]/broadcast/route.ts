import { NextResponse } from 'next/server';

import { buildVisitStoreBroadcastMessage } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { broadcastTextToOptInCustomers } from '@/lib/whatsapp-broadcast';

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
    .select('id, title, body, discount_percent, kind, branch_id, is_active')
    .eq('id', id)
    .maybeSingle();

  if (error || !promo) {
    return NextResponse.json({ error: 'Promoción no encontrada' }, { status: 404 });
  }

  if (promo.branch_id !== auth.branchId) {
    return NextResponse.json({ error: 'Promoción de otra sucursal' }, { status: 403 });
  }

  const { data: pack } = await supabase
    .from('clearance_packs')
    .select('id')
    .eq('promotion_id', promo.id)
    .maybeSingle();

  const webUrl = process.env.NEXT_PUBLIC_WEB_URL ?? 'https://puerta-verde-web.vercel.app';
  const message = pack
    ? buildVisitStoreBroadcastMessage({
        title: promo.title,
        body: promo.body,
        branchName: auth.branchName,
      })
    : buildPromoBroadcastMessage({
        title: promo.title,
        body: promo.body,
        discountPercent: promo.discount_percent ? Number(promo.discount_percent) : null,
        storeUrl: `${webUrl}/${auth.branchSlug}`,
      });

  const result = await broadcastTextToOptInCustomers({
    organizationId: auth.organizationId,
    body: message,
    templateKey: 'promo_broadcast',
  });
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    ...result,
  });
}
