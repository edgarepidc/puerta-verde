import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { mexicoYmdAtClockIso, parseSoldOnDate } from '@/lib/mexico-date';

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function roundQty(amount: number): number {
  return Math.round(amount * 1000) / 1000;
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function loadOrderItems(supabase: AdminClient, orderId: string) {
  const withWeigh = await supabase
    .from('order_items')
    .select(
      'id, branch_product_id, product_name, unit, quantity, ordered_quantity, weigh_at_fulfillment, unit_price, line_total',
    )
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  if (!withWeigh.error) return withWeigh.data ?? [];
  if (!/ordered_quantity|weigh_at_fulfillment/i.test(withWeigh.error.message)) {
    throw new Error(withWeigh.error.message);
  }
  const { data, error } = await supabase
    .from('order_items')
    .select('id, branch_product_id, product_name, unit, quantity, unit_price, line_total')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...row,
    ordered_quantity: null,
    weigh_at_fulfillment: false,
  }));
}

async function recalculateOrderTotals(
  supabase: AdminClient,
  orderId: string,
  branchId: string,
  deliveryFee: number,
  discountAmount = 0,
) {
  const items = await loadOrderItems(supabase, orderId);
  const subtotal = roundMoney(items.reduce((sum, row) => sum + Number(row.line_total), 0));
  const discount = Math.max(0, Number(discountAmount) || 0);
  const total = roundMoney(Math.max(0, subtotal - discount) + deliveryFee);
  const { error } = await supabase
    .from('orders')
    .update({ subtotal, total })
    .eq('id', orderId)
    .eq('branch_id', branchId);
  if (error) throw new Error(error.message);
  return { items, subtotal, total };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await context.params;
    const supabase = createAdminClient();

    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        customer_name,
        customer_phone,
        status,
        fulfillment_type,
        delivery_notes,
        total,
        subtotal,
        delivery_fee,
        payment_status,
        payment_method,
        tracking_token,
        created_at,
        paid_at
      `)
      .eq('id', id)
      .eq('branch_id', auth.branchId)
      .maybeSingle();

    if (error || !order) {
      return NextResponse.json({ error: error?.message ?? 'Pedido no encontrado' }, { status: 404 });
    }

    const items = await loadOrderItems(supabase, id);
    return NextResponse.json({ order, items });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar pedido' },
      { status: 500 },
    );
  }
}

/**
 * Edit order lines: update quantities, remove products, and/or add products.
 * Stock is adjusted via inventory movements.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'orders.edit',
    'No tienes permiso para editar pedidos',
  );
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      items?: Array<{ id?: string; quantity?: number; orderedQuantity?: number | null }>;
      removeItemIds?: string[];
      addItems?: Array<{
        branchProductId?: string;
        quantity?: number;
        orderedQuantity?: number | null;
      }>;
      soldOn?: string | null;
    };

    const updates = new Map<string, { quantity: number; orderedQuantity: number | null | undefined }>();
    for (const item of body.items ?? []) {
      if (!item?.id || typeof item.id !== 'string') {
        return NextResponse.json({ error: 'Partida inválida' }, { status: 400 });
      }
      const qty = Number(item.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        return NextResponse.json(
          { error: 'La cantidad debe ser mayor a cero' },
          { status: 400 },
        );
      }
      let orderedQuantity: number | null | undefined = undefined;
      if (item.orderedQuantity !== undefined) {
        if (item.orderedQuantity === null) {
          orderedQuantity = null;
        } else if (item.orderedQuantity !== undefined) {
          const ordered = Number(item.orderedQuantity);
          if (!Number.isFinite(ordered) || ordered <= 0) {
            return NextResponse.json(
              { error: 'Las piezas pedidas deben ser mayores a cero' },
              { status: 400 },
            );
          }
          orderedQuantity = roundQty(ordered);
        }
      }
      updates.set(item.id, { quantity: roundQty(qty), orderedQuantity });
    }

    const removeIds = new Set<string>();
    for (const itemId of body.removeItemIds ?? []) {
      if (typeof itemId !== 'string' || !itemId) {
        return NextResponse.json({ error: 'Partida a eliminar inválida' }, { status: 400 });
      }
      removeIds.add(itemId);
    }

    const addItems: Array<{
      branchProductId: string;
      quantity: number;
      orderedQuantity: number | null;
    }> = [];
    for (const item of body.addItems ?? []) {
      if (!item?.branchProductId || typeof item.branchProductId !== 'string') {
        return NextResponse.json({ error: 'Producto a agregar inválido' }, { status: 400 });
      }
      const qty = Number(item.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        return NextResponse.json(
          { error: 'La cantidad a agregar debe ser mayor a cero' },
          { status: 400 },
        );
      }
      let orderedQuantity: number | null = null;
      if (item.orderedQuantity != null) {
        const ordered = Number(item.orderedQuantity);
        if (!Number.isFinite(ordered) || ordered <= 0) {
          return NextResponse.json(
            { error: 'Las piezas pedidas deben ser mayores a cero' },
            { status: 400 },
          );
        }
        orderedQuantity = roundQty(ordered);
      }
      addItems.push({
        branchProductId: item.branchProductId,
        quantity: roundQty(qty),
        orderedQuantity,
      });
    }

    const hasLineChanges = updates.size > 0 || removeIds.size > 0 || addItems.length > 0;
    const wantsDateChange = body.soldOn != null && String(body.soldOn).trim() !== '';
    let soldOnYmd: string | null = null;
    if (wantsDateChange) {
      const parsed = parseSoldOnDate(body.soldOn);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      soldOnYmd = parsed.ymd;
    }

    if (!hasLineChanges && !soldOnYmd) {
      return NextResponse.json({ error: 'Indica los cambios del pedido' }, { status: 400 });
    }

    for (const itemId of removeIds) {
      updates.delete(itemId);
    }

    const supabase = createAdminClient();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, status, delivery_fee, subtotal, total, discount_amount, payment_status, created_at')
      .eq('id', id)
      .eq('branch_id', auth.branchId)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json(
        { error: orderError?.message ?? 'Pedido no encontrado' },
        { status: 404 },
      );
    }

    if (order.status === 'cancelled') {
      return NextResponse.json({ error: 'No se puede editar un pedido cancelado' }, { status: 400 });
    }

    let soldOnIso: string | null = null;
    if (soldOnYmd) {
      const originalClock = new Date(order.created_at);
      soldOnIso = mexicoYmdAtClockIso(
        soldOnYmd,
        Number.isNaN(originalClock.getTime()) ? new Date() : originalClock,
      );
      const dateUpdate: { created_at: string; paid_at?: string } = { created_at: soldOnIso };
      if (order.payment_status === 'paid') {
        dateUpdate.paid_at = soldOnIso;
      }
      const { error: dateError } = await supabase
        .from('orders')
        .update(dateUpdate)
        .eq('id', id)
        .eq('branch_id', auth.branchId);
      if (dateError) {
        return NextResponse.json({ error: dateError.message }, { status: 400 });
      }
    }

    if (!hasLineChanges) {
      const items = await loadOrderItems(supabase, id);
      return NextResponse.json({
        ok: true,
        order: {
          id,
          subtotal: order.subtotal,
          total: order.total,
          created_at: soldOnIso ?? order.created_at,
        },
        items,
      });
    }

    const { data: rowsWithWeigh, error: itemsError } = await supabase
      .from('order_items')
      .select(
        'id, branch_product_id, quantity, ordered_quantity, weigh_at_fulfillment, unit_price, product_name, unit, unit_cost',
      )
      .eq('order_id', id);

    let rows = rowsWithWeigh;
    if (itemsError) {
      if (!/ordered_quantity|weigh_at_fulfillment/i.test(itemsError.message)) {
        return NextResponse.json({ error: itemsError.message }, { status: 400 });
      }
      return NextResponse.json(
        {
          error:
            'Falta aplicar la migración de “pesar al preparar” antes de editar pedidos con peso.',
        },
        { status: 400 },
      );
    }

    const byId = new Map((rows ?? []).map((row) => [row.id, row]));
    for (const itemId of [...updates.keys(), ...removeIds]) {
      if (!byId.has(itemId)) {
        return NextResponse.json(
          { error: 'Una partida no pertenece a este pedido' },
          { status: 400 },
        );
      }
    }

    const remainingAfterRemove = (rows ?? []).filter((row) => !removeIds.has(row.id)).length;
    if (remainingAfterRemove + addItems.length < 1) {
      return NextResponse.json(
        { error: 'El pedido debe quedar con al menos un producto' },
        { status: 400 },
      );
    }

    // Remove lines first (restore stock).
    for (const itemId of removeIds) {
      const row = byId.get(itemId)!;
      const qty = Number(row.quantity);
      if (Number.isFinite(qty) && qty > 0) {
        const { error: moveError } = await supabase.rpc('record_inventory_movement', {
          p_branch_product_id: row.branch_product_id,
          p_movement_type: 'adjustment',
          p_quantity: qty,
          p_notes: `Quitar de pedido #${order.order_number}: ${row.product_name}`,
          p_expires_at: null,
          p_unit_cost: null,
        });
        if (moveError) {
          return NextResponse.json({ error: moveError.message }, { status: 400 });
        }
      }

      const { error: deleteError } = await supabase
        .from('order_items')
        .delete()
        .eq('id', itemId)
        .eq('order_id', id);
      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 400 });
      }
      byId.delete(itemId);
    }

    // Quantity updates on remaining lines.
    for (const [itemId, patch] of updates) {
      const row = byId.get(itemId);
      if (!row) continue;
      const newQty = patch.quantity;
      const oldQty = Number(row.quantity);
      const delta = roundQty(oldQty - newQty);
      if (delta !== 0) {
        const { error: moveError } = await supabase.rpc('record_inventory_movement', {
          p_branch_product_id: row.branch_product_id,
          p_movement_type: 'adjustment',
          p_quantity: delta,
          p_notes: `Ajuste pedido #${order.order_number}: ${row.product_name} (${oldQty} → ${newQty})`,
          p_expires_at: null,
          p_unit_cost: null,
        });
        if (moveError) {
          return NextResponse.json({ error: moveError.message }, { status: 400 });
        }
      }

      const lineTotal = roundMoney(Number(row.unit_price) * newQty);
      const itemPatch: {
        quantity: number;
        line_total: number;
        ordered_quantity?: number | null;
        weigh_at_fulfillment?: boolean;
      } = { quantity: newQty, line_total: lineTotal };
      if (patch.orderedQuantity !== undefined) {
        itemPatch.ordered_quantity = patch.orderedQuantity;
        if (patch.orderedQuantity != null) {
          itemPatch.weigh_at_fulfillment = true;
        }
      }
      const { error: itemUpdateError } = await supabase
        .from('order_items')
        .update(itemPatch)
        .eq('id', itemId)
        .eq('order_id', id);
      if (itemUpdateError) {
        return NextResponse.json({ error: itemUpdateError.message }, { status: 400 });
      }
    }

    // Add new products (or merge into existing line for same branch product).
    for (const add of addItems) {
      const existing = [...byId.values()].find(
        (row) => row.branch_product_id === add.branchProductId,
      );

      if (existing) {
        const oldQty = Number(existing.quantity);
        const newQty = roundQty(oldQty + add.quantity);
        const { error: moveError } = await supabase.rpc('record_inventory_movement', {
          p_branch_product_id: existing.branch_product_id,
          p_movement_type: 'adjustment',
          p_quantity: -add.quantity,
          p_notes: `Agregar a pedido #${order.order_number}: ${existing.product_name}`,
          p_expires_at: null,
          p_unit_cost: null,
        });
        if (moveError) {
          return NextResponse.json({ error: moveError.message }, { status: 400 });
        }

        const lineTotal = roundMoney(Number(existing.unit_price) * newQty);
        const mergePatch: {
          quantity: number;
          line_total: number;
          ordered_quantity?: number | null;
          weigh_at_fulfillment?: boolean;
        } = { quantity: newQty, line_total: lineTotal };
        if (add.orderedQuantity != null) {
          const prevOrdered = Number(existing.ordered_quantity ?? 0);
          mergePatch.ordered_quantity = roundQty(prevOrdered + add.orderedQuantity);
          mergePatch.weigh_at_fulfillment = true;
        }
        const { error: itemUpdateError } = await supabase
          .from('order_items')
          .update(mergePatch)
          .eq('id', existing.id)
          .eq('order_id', id);
        if (itemUpdateError) {
          return NextResponse.json({ error: itemUpdateError.message }, { status: 400 });
        }
        byId.set(existing.id, { ...existing, quantity: newQty });
        continue;
      }

      const { data: bp, error: bpError } = await supabase
        .from('branch_products')
        .select(
          'id, price, stock, avg_unit_cost, product:products ( name, unit, weigh_at_fulfillment )',
        )
        .eq('id', add.branchProductId)
        .eq('branch_id', auth.branchId)
        .eq('is_available', true)
        .maybeSingle();

      if (bpError || !bp) {
        return NextResponse.json(
          { error: bpError?.message ?? 'Producto no disponible en esta sucursal' },
          { status: 400 },
        );
      }

      const product = Array.isArray(bp.product) ? bp.product[0] : bp.product;
      if (!product?.name || !product.unit) {
        return NextResponse.json({ error: 'Producto incompleto' }, { status: 400 });
      }

      if (Number(bp.stock) < add.quantity) {
        return NextResponse.json(
          { error: `Stock insuficiente para ${product.name}` },
          { status: 400 },
        );
      }

      const weighAtFulfillment =
        Boolean(product.weigh_at_fulfillment) || add.orderedQuantity != null;
      if (weighAtFulfillment && add.orderedQuantity == null) {
        return NextResponse.json(
          { error: `Indica cuántas piezas de ${product.name}` },
          { status: 400 },
        );
      }

      const unitPrice = roundMoney(Number(bp.price));
      const lineTotal = roundMoney(unitPrice * add.quantity);
      const unitCost =
        bp.avg_unit_cost != null && Number.isFinite(Number(bp.avg_unit_cost))
          ? roundMoney(Number(bp.avg_unit_cost))
          : null;

      const { error: moveError } = await supabase.rpc('record_inventory_movement', {
        p_branch_product_id: bp.id,
        p_movement_type: 'adjustment',
        p_quantity: -add.quantity,
        p_notes: `Agregar a pedido #${order.order_number}: ${product.name}`,
        p_expires_at: null,
        p_unit_cost: null,
      });
      if (moveError) {
        return NextResponse.json({ error: moveError.message }, { status: 400 });
      }

      const { data: inserted, error: insertError } = await supabase
        .from('order_items')
        .insert({
          order_id: id,
          branch_product_id: bp.id,
          product_name: product.name,
          unit: product.unit,
          quantity: add.quantity,
          ordered_quantity: add.orderedQuantity,
          weigh_at_fulfillment: weighAtFulfillment,
          unit_price: unitPrice,
          line_total: lineTotal,
          unit_cost: unitCost,
        })
        .select(
          'id, branch_product_id, quantity, ordered_quantity, weigh_at_fulfillment, unit_price, product_name, unit, unit_cost',
        )
        .single();

      if (insertError || !inserted) {
        return NextResponse.json(
          { error: insertError?.message ?? 'No se pudo agregar el producto' },
          { status: 400 },
        );
      }
      byId.set(inserted.id, inserted);
    }

    const totals = await recalculateOrderTotals(
      supabase,
      id,
      auth.branchId,
      Number(order.delivery_fee ?? 0),
      Number(order.discount_amount ?? 0),
    );

    return NextResponse.json({
      ok: true,
      order: {
        id,
        subtotal: totals.subtotal,
        total: totals.total,
        created_at: soldOnIso ?? order.created_at,
      },
      items: totals.items,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al editar pedido' },
      { status: 500 },
    );
  }
}

/** Delete order and restore stock for all line items. */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'orders.delete',
    'No tienes permiso para eliminar pedidos',
  );
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const supabase = createAdminClient();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, status')
      .eq('id', id)
      .eq('branch_id', auth.branchId)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json(
        { error: orderError?.message ?? 'Pedido no encontrado' },
        { status: 404 },
      );
    }

    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('id, branch_product_id, quantity, product_name')
      .eq('order_id', id);

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 400 });
    }

    for (const item of items ?? []) {
      const qty = Number(item.quantity);
      if (!Number.isFinite(qty) || qty <= 0) continue;

      const { error: moveError } = await supabase.rpc('record_inventory_movement', {
        p_branch_product_id: item.branch_product_id,
        p_movement_type: 'adjustment',
        p_quantity: qty,
        p_notes: `Eliminación pedido #${order.order_number}: ${item.product_name}`,
        p_expires_at: null,
        p_unit_cost: null,
      });
      if (moveError) {
        return NextResponse.json({ error: moveError.message }, { status: 400 });
      }
    }

    const { error: deleteError } = await supabase
      .from('orders')
      .delete()
      .eq('id', id)
      .eq('branch_id', auth.branchId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al eliminar pedido' },
      { status: 500 },
    );
  }
}
