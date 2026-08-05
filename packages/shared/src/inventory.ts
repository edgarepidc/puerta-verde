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
  notes?: string | null;
  expiresAt?: string | null;
}

export function validateInventoryMovement(input: InventoryMovementInput): string | null {
  if (!input.branchProductId) return 'Selecciona un producto.';
  if (!MANUAL_INVENTORY_TYPES.includes(input.movementType)) {
    return 'Tipo de movimiento inválido.';
  }
  if (input.movementType === 'adjustment') {
    if (input.quantity === 0) return 'El ajuste no puede ser cero.';
  } else if (input.quantity <= 0) {
    return 'La cantidad debe ser mayor a cero.';
  }
  return null;
}

export const LOW_STOCK_THRESHOLD = 5;
