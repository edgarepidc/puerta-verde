import { PRODUCT_UNIT_LABELS, formatDecimal, type ProductUnit } from './index';
import { LOW_STOCK_THRESHOLD } from './inventory';

export type StockStatus = 'out' | 'low' | 'available';

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  out: 'Agotado',
  low: 'Últimas unidades',
  available: 'Disponible',
};

export function getStockStatus(
  stock: number,
  isAvailable = true,
  minStock = LOW_STOCK_THRESHOLD,
): StockStatus {
  if (!isAvailable || stock <= 0) return 'out';
  if (stock < minStock) return 'low';
  return 'available';
}

export function getQuantityStep(unit: ProductUnit): number {
  return unit === 'kg' ? 0.25 : 1;
}

/** Starting qty when adding a product to the cart (any unit). */
export function getDefaultQuantity(_unit?: ProductUnit): number {
  return 1;
}

/** Provisional kg charged/reserved per piece until staff weighs at prep. */
export const DEFAULT_ESTIMATED_KG_PER_PIECE = 1;

export function estimatedKgForPieces(
  pieces: number,
  kgPerPiece = DEFAULT_ESTIMATED_KG_PER_PIECE,
): number {
  return Math.round(Math.max(0, pieces) * kgPerPiece * 100) / 100;
}

export function maxPiecesFromStock(
  stockKg: number,
  kgPerPiece = DEFAULT_ESTIMATED_KG_PER_PIECE,
): number {
  if (kgPerPiece <= 0) return 0;
  return Math.max(0, Math.floor(Number(stockKg) / kgPerPiece));
}

export function formatProductQuantity(quantity: number, unit: ProductUnit): string {
  const label = PRODUCT_UNIT_LABELS[unit];
  const formatted = formatDecimal(quantity);
  return `${formatted} ${label}`;
}

export function applyDiscount(price: number, discountPercent: number): number {
  if (discountPercent <= 0) return price;
  return Math.round(price * (1 - discountPercent / 100) * 100) / 100;
}

export function getActiveDiscountPercent(
  promotions: Array<{
    kind: string;
    discount_percent?: number | null;
    product_id?: string | null;
    category_id?: string | null;
  }>,
  product?: { id?: string | null; category_id?: string | null },
): number {
  return promotions.reduce((max, promo) => {
    if (promo.kind !== 'discount' || !promo.discount_percent) return max;
    if (promo.product_id && promo.product_id !== product?.id) return max;
    if (promo.category_id && promo.category_id !== product?.category_id) return max;
    return Math.max(max, Number(promo.discount_percent));
  }, 0);
}
