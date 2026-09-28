import { NextResponse } from 'next/server';

import {
  CLEARANCE_PACK_DEFAULT_TITLE,
  buildVisitStoreBroadcastMessage,
  formatClearancePackPromoBody,
  formatMoney,
  isWeighProduce,
  validateAssembleClearancePack,
  type AssembleClearancePackInput,
} from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { upsertClearancePackTemplate } from '@/lib/clearance-pack-templates';
import { mexicoYmdBoundsIso, todayMexicoYmd } from '@/lib/mexico-date';
import { getDefaultTenant } from '@/lib/tenant';
import { broadcastTextToOptInCustomers } from '@/lib/whatsapp-broadcast';

const PACK_SELECT = `
  id,
  title,
  price,
  quantity_made,
  quantity_remaining,
  status,
  branch_product_id,
  promotion_id,
  assembled_at,
  items:clearance_pack_items (
    product_name,
    quantity,
    unit
  )
`;

async function upsertPackPromo(
  supabase: ReturnType<typeof createAdminClient>,
  input: {
    branchId: string;
    packId: string;
    promotionId: string | null;
    title: string;
    body: string;
  },
) {
  const endsAt = mexicoYmdBoundsIso(todayMexicoYmd()).end;
  if (input.promotionId) {
    const { error } = await supabase
      .from('promotions')
      .update({
        title: input.title,
        body: input.body,
        kind: 'bundle',
        is_active: true,
        starts_at: new Date().toISOString(),
        ends_at: endsAt,
      })
      .eq('id', input.promotionId)
      .eq('branch_id', input.branchId);
    if (error) throw new Error(error.message);
    return input.promotionId;
  }

  const { data, error } = await supabase
    .from('promotions')
    .insert({
      branch_id: input.branchId,
      title: input.title,
      body: input.body,
      kind: 'bundle',
      is_active: true,
      starts_at: new Date().toISOString(),
      ends_at: endsAt,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'No se pudo crear el cartel');

  const { error: packError } = await supabase
    .from('clearance_packs')
    .update({ promotion_id: data.id })
    .eq('id', input.packId);
  if (packError) throw new Error(packError.message);
  return data.id as string;
}

export async function GET() {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const tenant = await getDefaultTenant();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('clearance_packs')
    .select(PACK_SELECT)
    .eq('branch_id', tenant.branchId)
    .in('status', ['active'])
    .order('assembled_at', { ascending: false })
    .limit(5);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ packs: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'inventory.adjust',
    'No tienes permiso para armar paquetes',
  );
  if (denied) return denied;

  try {
    const tenant = await getDefaultTenant();
    const body = (await request.json()) as AssembleClearancePackInput;
    const validationError = validateAssembleClearancePack(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const supabase = createAdminClient();
    const title = body.title?.trim() || CLEARANCE_PACK_DEFAULT_TITLE;
    const itemIds = body.items.map((item) => item.branchProductId);
    const { data: ingredientRows, error: ingredientError } = await supabase
      .from('branch_products')
      .select('id, product_id, product:products ( unit, weigh_at_fulfillment )')
      .eq('branch_id', tenant.branchId)
      .in('id', itemIds);
    if (ingredientError) {
      return NextResponse.json({ error: ingredientError.message }, { status: 400 });
    }

    const ingredients = new Map(
      (ingredientRows ?? []).map((row) => {
        const product = Array.isArray(row.product) ? row.product[0] : row.product;
        return [
          row.id,
          {
            productId: row.product_id as string,
            weigh: isWeighProduce({
              unit: product?.unit,
              weighAtFulfillment: Boolean(product?.weigh_at_fulfillment),
            }),
          },
        ];
      }),
    );

    for (const item of body.items) {
      const ingredient = ingredients.get(item.branchProductId);
      if (ingredient?.weigh && !(Number(item.pieces) > 0)) {
        return NextResponse.json(
          { error: 'Indica las piezas de cada producto que se vende por pieza.' },
          { status: 400 },
        );
      }
    }

    const { data, error } = await supabase.rpc('assemble_clearance_pack', {
      p_branch_id: tenant.branchId,
      p_title: title,
      p_price: Number(body.price),
      p_bag_count: Number(body.bagCount),
      p_items: body.items.map((item) => ({
        branch_product_id: item.branchProductId,
        quantity: item.quantity,
        pieces: item.pieces ?? null,
      })),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const assembled = data?.[0];
    if (!assembled) {
      return NextResponse.json({ error: 'No se pudo armar el paquete' }, { status: 400 });
    }

    if (body.saveTemplate !== false) {
      await upsertClearancePackTemplate(supabase, {
        branchId: tenant.branchId,
        templateId: body.templateId,
        title,
        price: Number(body.price),
        bagCount: Number(body.bagCount),
        items: body.items.flatMap((item) => {
          const ingredient = ingredients.get(item.branchProductId);
          if (!ingredient) return [];
          return [
            {
              productId: ingredient.productId,
              weigh: ingredient.weigh,
              quantity: item.quantity,
              pieces: item.pieces ?? null,
            },
          ];
        }),
      });
    }

    const [{ data: packProduct }, { data: packRow }] = await Promise.all([
      supabase
        .from('branch_products')
        .select(
          'id, price, stock, min_stock, piece_stock, product:products ( id, name, unit, sku, image_url, weigh_at_fulfillment, pos_only )',
        )
        .eq('id', assembled.branch_product_id)
        .maybeSingle(),
      supabase
        .from('clearance_packs')
        .select(`${PACK_SELECT}`)
        .eq('id', assembled.pack_id)
        .maybeSingle(),
    ]);

    const contents = [...new Set((packRow?.items ?? []).map(
      (item: { product_name: string }) => item.product_name,
    ))];
    const promoTitle = `${assembled.title} ${formatMoney(Number(assembled.price))}`;
    const promoBody = formatClearancePackPromoBody({
      remaining: Number(assembled.quantity_remaining),
      price: Number(assembled.price),
      contents,
      branchName: auth.branchName,
    });

    const promotionId = await upsertPackPromo(supabase, {
      branchId: tenant.branchId,
      packId: assembled.pack_id,
      promotionId: packRow?.promotion_id ?? null,
      title: promoTitle,
      body: promoBody,
    });

    let broadcast: { audience: number; sent: number; failed: number } | null = null;
    if (body.notifyNeighbors) {
      const message = buildVisitStoreBroadcastMessage({
        title: promoTitle,
        body: promoBody,
        branchName: auth.branchName,
      });
      const result = await broadcastTextToOptInCustomers({
        organizationId: auth.organizationId,
        body: message,
        templateKey: 'clearance_pack',
      });
      if ('error' in result) {
        return NextResponse.json({
          pack: packRow,
          product: packProduct,
          promotionId,
          broadcastError: result.error,
        });
      }
      broadcast = result;
    }

    return NextResponse.json({
      pack: packRow,
      product: packProduct,
      promotionId,
      broadcast,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al armar el paquete' },
      { status: 500 },
    );
  }
}
