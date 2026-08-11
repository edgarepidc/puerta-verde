export interface PurchaseItemInput {
  branchProductId: string;
  quantity: number;
  unitPrice: number;
}

export interface PurchaseInput {
  supplierId: string;
  purchasedAt?: string | null;
  notes?: string | null;
  items: PurchaseItemInput[];
}

export interface SupplierInput {
  name: string;
  phone?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

export function validateSupplierInput(input: SupplierInput): string | null {
  if (!input.name?.trim()) return 'El nombre del proveedor es obligatorio.';
  if (input.name.trim().length > 120) return 'El nombre del proveedor es demasiado largo.';
  return null;
}

export function validatePurchaseInput(input: PurchaseInput): string | null {
  if (!input.supplierId) return 'Selecciona un proveedor.';
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return 'Agrega al menos un producto a la compra.';
  }
  for (const item of input.items) {
    if (!item.branchProductId) return 'Cada partida necesita un producto.';
    if (!(item.quantity > 0)) return 'La cantidad debe ser mayor a cero.';
    if (item.unitPrice == null || item.unitPrice < 0) {
      return 'El precio unitario es obligatorio y no puede ser negativo.';
    }
  }
  return null;
}
