import { NextResponse } from 'next/server';

import { buildVisitStoreBroadcastMessage } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { broadcastTextToOptInCustomers } from '@/lib/whatsapp-broadcast';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'inventory.adjust',
    'No tienes permiso para avisar el paquete',
  );
  if (denied) return denied;

  const { id } = await params;
  const supabase = createAdminClient();
  const { data: pack, error } = await supabase
    .from('clearance_packs')
    .select(
      'id, branch_id, title, price, quantity_remaining, status, promotion:promotions ( title, body )',
    )
    .eq('id', id)
    .maybeSingle();

  if (error || !pack) {
    return NextResponse.json({ error: 'Paquete no encontrado' }, { status: 404 });
  }
  if (pack.branch_id !== auth.branchId) {
    return NextResponse.json({ error: 'Paquete de otra sucursal' }, { status: 403 });
  }
  if (pack.status !== 'active' || Number(pack.quantity_remaining) <= 0) {
    return NextResponse.json({ error: 'Ya no hay bolsas para avisar' }, { status: 400 });
  }

  const promoRaw = pack.promotion as
    | { title: string | null; body: string | null }
    | { title: string | null; body: string | null }[]
    | null;
  const promo = Array.isArray(promoRaw) ? promoRaw[0] : promoRaw;
  const message = buildVisitStoreBroadcastMessage({
    title: promo?.title || pack.title,
    body: promo?.body ?? null,
    branchName: auth.branchName,
  });

  const result = await broadcastTextToOptInCustomers({
    organizationId: auth.organizationId,
    body: message,
    templateKey: 'clearance_pack',
  });
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, ...result });
}
