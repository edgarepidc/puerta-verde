import { PRODUCT_UNITS, type ProductUnit } from './index';

export interface ProductInput {
  name: string;
  description?: string | null;
  categoryId?: string | null;
  unit: ProductUnit;
  price: number;
  stock: number;
  isAvailable: boolean;
  isActive: boolean;
}

export function validateProductInput(input: ProductInput): string | null {
  if (!input.name.trim()) return 'El nombre del producto es obligatorio.';
  if (!PRODUCT_UNITS.includes(input.unit)) return 'Unidad inválida.';
  if (input.price < 0) return 'El precio no puede ser negativo.';
  if (input.stock < 0) return 'El stock no puede ser negativo.';
  return null;
}
