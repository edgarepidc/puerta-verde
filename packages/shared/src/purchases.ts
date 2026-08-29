export const PRODUCT_QUALITIES = ['premium', 'normal', 'saldo'] as const;
export type ProductQuality = (typeof PRODUCT_QUALITIES)[number];

export const PRODUCT_QUALITY_LABELS: Record<ProductQuality, string> = {
  premium: 'Premium',
  normal: 'Normal',
  saldo: 'Saldo',
};

export function isProductQuality(value: unknown): value is ProductQuality {
  return typeof value === 'string' && (PRODUCT_QUALITIES as readonly string[]).includes(value);
}

export interface PurchaseItemInput {
  branchProductId: string;
  /** Kg (or product unit) received */
  quantity: number;
  unitPrice: number;
  quality?: ProductQuality | null;
  /** Pieces received when product is weigh_at_fulfillment */
  pieceCount?: number | null;
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
    if (item.quality != null && !isProductQuality(item.quality)) {
      return 'La calidad debe ser premium, normal o saldo.';
    }
    if (item.pieceCount != null && !(item.pieceCount > 0)) {
      return 'Las piezas deben ser mayores a cero.';
    }
  }
  return null;
}
