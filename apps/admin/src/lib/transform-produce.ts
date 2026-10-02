import { roundStockQty, validateTransformProduce } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

const WHOLE_UNITS = new Set(['piece', 'bunch', 'bag', 'box']);

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function transformProduce(input: {
  sourceBranchProductId: string;
  destBranchProductId: string;
  sourceQuantity: number;
  destQuantity: number;
  destUnit?: string | null;
  notes?: string | null;
}): Promise<{ source_stock: number; dest_stock: number; dest_avg_unit_cost: number }> {
  const validation = validateTransformProduce(input);
  if (validation) throw new Error(validation);

  const supabase = createAdminClient();
  const sourceId = input.sourceBranchProductId;
  const destId = input.destBranchProductId;

  const [{ data: source, error: sourceError }, { data: dest, error: destError }] = await Promise.all([
    supabase
      .from('branch_products')
      .select(
        'id, branch_id, stock, piece_stock, avg_unit_cost, last_unit_cost, is_available, product:products(name, unit, pos_only)',
      )
      .eq('id', sourceId)
      .maybeSingle(),
    supabase
      .from('branch_products')
      .select(
        'id, branch_id, stock, piece_stock, avg_unit_cost, last_unit_cost, is_available, product:products(name, unit, pos_only)',
      )
      .eq('id', destId)
      .maybeSingle(),
  ]);
  if (sourceError) throw new Error(sourceError.message);
  if (destError) throw new Error(destError.message);
  if (!source || !dest) throw new Error('Producto de sucursal no encontrado');
  if (source.branch_id !== dest.branch_id) {
    throw new Error('Los dos productos tienen que ser de la misma sucursal');
  }

  const sourceProduct = Array.isArray(source.product) ? source.product[0] : source.product;
  const destProduct = Array.isArray(dest.product) ? dest.product[0] : dest.product;
  if (!sourceProduct || !destProduct) throw new Error('Producto de sucursal no encontrado');
  if (destProduct.pos_only) {
    throw new Error('Ese producto es un paquete de mostrador. Ármalo desde Caja.');
  }

  let consume = roundStockQty(input.sourceQuantity);
  const make = roundStockQty(input.destQuantity);
  if (WHOLE_UNITS.has(destProduct.unit) && make !== Math.round(make)) {
    throw new Error('Indica piezas enteras');
  }

  const sourceStock = Number(source.stock);
  if (sourceStock <= 0) throw new Error('Ya no hay stock que convertir');
  if (consume > sourceStock) consume = sourceStock;

  const destStockBefore = Number(dest.stock);
  const destUnitCost = roundMoney((Number(source.avg_unit_cost ?? 0) * consume) / make);
  const nextDestStock = roundStockQty(destStockBefore + make);
  const destAvg =
    nextDestStock <= 0
      ? destUnitCost
      : roundMoney(
          (Number(dest.avg_unit_cost ?? 0) * destStockBefore + destUnitCost * make) / nextDestStock,
        );
  const note = input.notes?.trim() || null;
  const sourceNotes = [`Convierte a ${destProduct.name}`, note].filter(Boolean).join(' · ');
  const destNotes = [
    `Hecho con ${sourceProduct.name} · ${consume} ${sourceProduct.unit}`,
    note,
  ]
    .filter(Boolean)
    .join(' · ');

  const nextSourceStock = roundStockQty(sourceStock - consume);
  const nextSourcePieces =
    nextSourceStock <= 0
      ? 0
      : WHOLE_UNITS.has(sourceProduct.unit)
        ? Math.max(0, Number(source.piece_stock ?? 0) - consume)
        : source.piece_stock;
  const nextDestPieces = WHOLE_UNITS.has(destProduct.unit)
    ? Number(dest.piece_stock ?? 0) + make
    : dest.piece_stock;

  const { error: sourceUpdateError } = await supabase
    .from('branch_products')
    .update({ stock: nextSourceStock, piece_stock: nextSourcePieces })
    .eq('id', sourceId);
  if (sourceUpdateError) throw new Error(sourceUpdateError.message);

  try {
    const { error: destUpdateError } = await supabase
      .from('branch_products')
      .update({
        stock: nextDestStock,
        piece_stock: nextDestPieces,
        is_available: true,
        avg_unit_cost: destAvg,
        last_unit_cost: destUnitCost,
      })
      .eq('id', destId);
    if (destUpdateError) throw new Error(destUpdateError.message);

    const { error: moveError } = await supabase.from('inventory_movements').insert([
      {
        branch_id: source.branch_id,
        branch_product_id: sourceId,
        movement_type: 'transform',
        quantity: consume,
        notes: sourceNotes,
        unit_cost: source.avg_unit_cost,
      },
      {
        branch_id: dest.branch_id,
        branch_product_id: destId,
        movement_type: 'transform',
        quantity: make,
        notes: destNotes,
        unit_cost: destUnitCost,
      },
    ]);
    if (moveError) throw new Error(moveError.message);
  } catch (error) {
    await Promise.all([
      supabase
        .from('branch_products')
        .update({ stock: source.stock, piece_stock: source.piece_stock })
        .eq('id', sourceId),
      supabase
        .from('branch_products')
        .update({
          stock: dest.stock,
          piece_stock: dest.piece_stock,
          avg_unit_cost: dest.avg_unit_cost,
          last_unit_cost: dest.last_unit_cost,
          is_available: dest.is_available,
        })
        .eq('id', destId),
    ]);
    throw error;
  }

  return {
    source_stock: nextSourceStock,
    dest_stock: nextDestStock,
    dest_avg_unit_cost: destAvg,
  };
}
