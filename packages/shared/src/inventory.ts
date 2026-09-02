export const INVENTORY_MOVEMENT_TYPES = ['purchase', 'sale', 'waste', 'adjustment'] as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export const MANUAL_INVENTORY_TYPES = ['purchase', 'waste', 'adjustment'] as const;
export type ManualInventoryMovementType = (typeof MANUAL_INVENTORY_TYPES)[number];

export const INVENTORY_MOVEMENT_LABELS: Record<InventoryMovementType, string> = {
  purchase: 'Entrada (compra)',
  sale: 'Venta',
  waste: 'Merma',
  adjustment: 'Ajuste',
};

export interface InventoryMovementInput {
  branchProductId: string;
  movementType: ManualInventoryMovementType;
  quantity: number;
  unitCost?: number | null;
  notes?: string | null;
  expiresAt?: string | null;
}

export function validateInventoryMovement(input: InventoryMovementInput): string | null {
  if (!input.branchProductId) return 'Selecciona un producto.';
  if (!MANUAL_INVENTORY_TYPES.includes(input.movementType)) {
    return 'Tipo de movimiento inválido.';
  }
  if (input.movementType === 'purchase') {
    if (input.unitCost == null || input.unitCost < 0) {
      return 'El costo de compra es obligatorio en entradas.';
    }
  }
  if (input.movementType === 'adjustment') {
    if (input.quantity === 0) return 'El ajuste no puede ser cero.';
  } else if (input.quantity <= 0) {
    return 'La cantidad debe ser mayor a cero.';
  }
  return null;
}

/** Default for count/volume units (kg, piece, bunch, box, bag, liter). */
export const LOW_STOCK_THRESHOLD = 3;
/** Chiles sold by kg: low when under 300 g. */
export const CHILE_LOW_STOCK_KG = 0.3;

export function isChileProduct(input: {
  name?: string | null;
  categoryName?: string | null;
}): boolean {
  const name = (input.name ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const category = (input.categoryName ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return category.includes('chile') || /(^|\s)chiles?\b/.test(name);
}

export function getDefaultLowStockThreshold(input: {
  unit: string;
  name?: string | null;
  categoryName?: string | null;
}): number {
  if (input.unit === 'kg' && isChileProduct(input)) return CHILE_LOW_STOCK_KG;
  return LOW_STOCK_THRESHOLD;
}

/** Low stock means strictly below the threshold (“menos de”). */
export function isLowStock(input: {
  stock: number;
  unit: string;
  minStock?: number | null;
  name?: string | null;
  categoryName?: string | null;
}): boolean {
  const stock = Number(input.stock);
  if (!Number.isFinite(stock)) return false;
  const threshold =
    input.minStock != null && Number.isFinite(Number(input.minStock))
      ? Number(input.minStock)
      : getDefaultLowStockThreshold(input);
  return stock < threshold;
}

/** Matches `branch_products.stock numeric(10, 3)`. */
export const STOCK_QTY_DECIMALS = 3;

/**
 * Quantity to send to `record_inventory_movement` from a physical count.
 * Count 0 means write off whatever is left (not the 2-decimal display).
 */
export function quantityForStockCount(input: {
  system: number;
  counted: number;
  kind: 'waste' | 'adjustment';
}): number {
  const system = Number(input.system);
  const counted = Number(input.counted);
  if (counted === 0) {
    return input.kind === 'waste' ? system : -system;
  }
  const delta = Number((counted - system).toFixed(STOCK_QTY_DECIMALS));
  return input.kind === 'waste' ? Math.abs(delta) : delta;
}
