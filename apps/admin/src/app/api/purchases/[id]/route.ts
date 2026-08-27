import { NextResponse } from 'next/server';

import { isProductQuality, type ProductQuality } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

interface PurchaseItemPatch {
  id: string;
  quantity: number;
  unitPrice: number;
  quality?: string | null;
  branchProductId?: string;
  pieceCount?: number | null;
}

interface PurchasePatchBody {
  supplierId?: string;
  purchasedAt?: string | null;
  notes?: string | null;
  items?: PurchaseItemPatch[];
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function adjustPieceStock(
  supabase: AdminClient,
  branchProductId: string,
  delta: number,
) {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.0005) return null;
  const { data, error } = await supabase
    .from('branch_products')
    .select('piece_stock')
    .eq('id', branchProductId)
    .maybeSingle();
  if (error) {
    if (/piece_stock/i.test(error.message)) return null;
    return error.message;
  }
  const next = Math.max(0, Number(data?.piece_stock ?? 0) + delta);
  const { error: updateError } = await supabase
    .from('branch_products')
    .update({ piece_stock: next })
    .eq('id', branchProductId);
  return updateError?.message ?? null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'purchases.manage',
    'No tienes permiso para editar compras',
  );
  if (denied) return denied;

  try {
    const { id: purchaseId } = await params;
    const tenant = await getDefaultTenant();
    const body = (await request.json()) as PurchasePatchBody;
    const supabase = createAdminClient();

    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .select(
        `
        id,
        branch_id,
        supplier_id,
        purchased_at,
        notes,
        items:purchase_items (
          id,
          branch_product_id,
          quantity,
          unit_price,
          quality,
          piece_count
        )
      `,
      )
      .eq('id', purchaseId)
      .eq('branch_id', tenant.branchId)
      .maybeSingle();

    if (purchaseError || !purchase) {
      return NextResponse.json({ error: 'Compra no encontrada' }, { status: 404 });
    }

    if (body.supplierId) {
      const { data: supplier } = await supabase
        .from('suppliers')
        .select('id')
        .eq('id', body.supplierId)
        .eq('organization_id', tenant.organizationId)
        .maybeSingle();
      if (!supplier) {
        return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 400 });
      }
    }

    const existingItems = (purchase.items ?? []) as Array<{
      id: string;
      branch_product_id: string;
      quantity: number;
      unit_price: number;
      quality: string | null;
      piece_count: number | null;
    }>;

    let total = 0;

    if (body.items?.length) {
      const existingById = new Map(existingItems.map((item) => [item.id, item]));

      for (const item of body.items) {
        const current = existingById.get(item.id);
        if (!current) {
          return NextResponse.json({ error: 'Partida no encontrada en esta compra' }, { status: 400 });
        }
        if (!(item.quantity > 0)) {
          return NextResponse.json({ error: 'La cantidad debe ser mayor a cero.' }, { status: 400 });
        }
        if (item.unitPrice == null || item.unitPrice < 0) {
          return NextResponse.json(
            { error: 'El precio unitario es obligatorio y no puede ser negativo.' },
            { status: 400 },
          );
        }
        if (item.pieceCount != null && !(item.pieceCount > 0)) {
          return NextResponse.json({ error: 'Las piezas deben ser mayores a cero.' }, { status: 400 });
        }
        const quality: ProductQuality =
          item.quality && isProductQuality(item.quality)
            ? item.quality
            : isProductQuality(current.quality)
              ? current.quality
              : 'normal';

        const nextBranchProductId = item.branchProductId?.trim() || current.branch_product_id;
        const nextPieces =
          item.pieceCount === undefined
            ? current.piece_count != null
              ? Number(current.piece_count)
              : null
            : item.pieceCount != null && item.pieceCount > 0
              ? Number(item.pieceCount)
              : null;
        const prevPieces = current.piece_count != null ? Number(current.piece_count) : 0;

        if (nextBranchProductId !== current.branch_product_id) {
          const { data: targetProduct } = await supabase
            .from('branch_products')
            .select('id')
            .eq('id', nextBranchProductId)
            .eq('branch_id', tenant.branchId)
            .maybeSingle();
          if (!targetProduct) {
            return NextResponse.json(
              { error: 'El producto seleccionado no pertenece a esta sucursal.' },
              { status: 400 },
            );
          }

          const { error: removeError } = await supabase.rpc('record_inventory_movement', {
            p_branch_product_id: current.branch_product_id,
            p_movement_type: 'adjustment',
            p_quantity: -Number(current.quantity),
            p_notes: `Cambio de producto (salida) edición compra ${purchaseId.slice(0, 8)}`,
            p_expires_at: null,
            p_unit_cost: null,
          });
          if (removeError) {
            return NextResponse.json({ error: removeError.message }, { status: 400 });
          }

          const pieceOut = await adjustPieceStock(supabase, current.branch_product_id, -prevPieces);
          if (pieceOut) {
            return NextResponse.json({ error: pieceOut }, { status: 400 });
          }

          const { error: addError } = await supabase.rpc('record_inventory_movement', {
            p_branch_product_id: nextBranchProductId,
            p_movement_type: 'adjustment',
            p_quantity: Number(item.quantity),
            p_notes: `Cambio de producto (entrada) edición compra ${purchaseId.slice(0, 8)}`,
            p_expires_at: null,
            p_unit_cost: item.unitPrice,
          });
          if (addError) {
            return NextResponse.json({ error: addError.message }, { status: 400 });
          }

          const pieceIn = await adjustPieceStock(
            supabase,
            nextBranchProductId,
            nextPieces ?? 0,
          );
          if (pieceIn) {
            return NextResponse.json({ error: pieceIn }, { status: 400 });
          }
        } else {
          const qtyDelta = Number(item.quantity) - Number(current.quantity);
          if (Math.abs(qtyDelta) > 0.0005) {
            const { error: moveError } = await supabase.rpc('record_inventory_movement', {
              p_branch_product_id: current.branch_product_id,
              p_movement_type: 'adjustment',
              p_quantity: qtyDelta,
              p_notes: `Ajuste edición de compra ${purchaseId.slice(0, 8)}`,
              p_expires_at: null,
              p_unit_cost: null,
            });
            if (moveError) {
              return NextResponse.json({ error: moveError.message }, { status: 400 });
            }
          }

          const piecesDelta = (nextPieces ?? 0) - prevPieces;
          const pieceErr = await adjustPieceStock(
            supabase,
            current.branch_product_id,
            piecesDelta,
          );
          if (pieceErr) {
            return NextResponse.json({ error: pieceErr }, { status: 400 });
          }
        }

        const { error: itemError } = await supabase
          .from('purchase_items')
          .update({
            branch_product_id: nextBranchProductId,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            quality,
            piece_count: nextPieces,
          })
          .eq('id', item.id)
          .eq('purchase_id', purchaseId);

        if (itemError) {
          return NextResponse.json({ error: itemError.message }, { status: 400 });
        }

        total += Math.round(item.quantity * item.unitPrice * 100) / 100;

        const shouldUpdateCost =
          nextBranchProductId !== current.branch_product_id ||
          Math.abs(Number(item.unitPrice) - Number(current.unit_price)) > 0.0005;
        if (shouldUpdateCost) {
          await supabase
            .from('branch_products')
            .update({ last_unit_cost: item.unitPrice })
            .eq('id', nextBranchProductId)
            .eq('branch_id', tenant.branchId);
        }
      }
    } else {
      total = existingItems.reduce(
        (sum, item) => sum + Math.round(Number(item.quantity) * Number(item.unit_price) * 100) / 100,
        0,
      );
    }

    const { error: updateError } = await supabase
      .from('purchases')
      .update({
        ...(body.supplierId ? { supplier_id: body.supplierId } : {}),
        ...(body.purchasedAt !== undefined
          ? { purchased_at: body.purchasedAt || purchase.purchased_at }
          : {}),
        ...(body.notes !== undefined
          ? { notes: body.notes?.trim() ? body.notes.trim() : null }
          : {}),
        total_amount: total,
      })
      .eq('id', purchaseId)
      .eq('branch_id', tenant.branchId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, totalAmount: total });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al actualizar compra' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'purchases.manage',
    'No tienes permiso para eliminar compras',
  );
  if (denied) return denied;

  try {
    const { id: purchaseId } = await params;
    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();

    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .select(
        `
        id,
        items:purchase_items (
          id,
          branch_product_id,
          quantity,
          piece_count
        )
      `,
      )
      .eq('id', purchaseId)
      .eq('branch_id', tenant.branchId)
      .maybeSingle();

    if (purchaseError || !purchase) {
      return NextResponse.json({ error: 'Compra no encontrada' }, { status: 404 });
    }

    const items = (purchase.items ?? []) as Array<{
      id: string;
      branch_product_id: string;
      quantity: number;
      piece_count: number | null;
    }>;

    for (const item of items) {
      const qty = Number(item.quantity);
      if (!(qty > 0)) continue;
      const { error: moveError } = await supabase.rpc('record_inventory_movement', {
        p_branch_product_id: item.branch_product_id,
        p_movement_type: 'adjustment',
        p_quantity: -qty,
        p_notes: `Eliminación de compra ${purchaseId.slice(0, 8)}`,
        p_expires_at: null,
        p_unit_cost: null,
      });
      if (moveError) {
        return NextResponse.json({ error: moveError.message }, { status: 400 });
      }
      const pieces = item.piece_count != null ? Number(item.piece_count) : 0;
      const pieceErr = await adjustPieceStock(supabase, item.branch_product_id, -pieces);
      if (pieceErr) {
        return NextResponse.json({ error: pieceErr }, { status: 400 });
      }
    }

    const { error: deleteError } = await supabase
      .from('purchases')
      .delete()
      .eq('id', purchaseId)
      .eq('branch_id', tenant.branchId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al eliminar compra' },
      { status: 500 },
    );
  }
}
