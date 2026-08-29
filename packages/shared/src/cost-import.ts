import { PRODUCT_UNITS, type ProductUnit } from './index';

export interface CostImportRow {
  productName: string;
  unitCost?: number | null;
  quantity?: number | null;
  salePrice?: number | null;
  categoryName?: string | null;
  unit?: ProductUnit | null;
  sku?: string | null;
  minStock?: number | null;
  visible?: boolean | null;
}

export interface ParsedCostImportRow extends CostImportRow {
  rowNumber: number;
}

const PRODUCT_HEADERS = ['producto', 'nombre', 'product', 'name', 'articulo', 'artículo'];
const COST_HEADERS = ['costo', 'costo_unitario', 'costo_compra', 'costo unitario', 'unit_cost', 'unit cost'];
const QUANTITY_HEADERS = ['cantidad', 'quantity', 'qty', 'stock', 'stock_inicial', 'stock inicial'];
const PRICE_HEADERS = ['precio', 'precio_venta', 'precio venta', 'price', 'sale_price', 'venta'];
const CATEGORY_HEADERS = ['categoria', 'categoría', 'category'];
const UNIT_HEADERS = ['unidad', 'unit'];
const SKU_HEADERS = ['sku', 'codigo', 'código', 'plu', 'barcode', 'codigo_barras'];
const MIN_STOCK_HEADERS = ['min_stock', 'minimo', 'mínimo', 'stock_minimo', 'stock mínimo'];
const VISIBLE_HEADERS = ['visible', 'tienda', 'disponible'];

const UNIT_ALIASES: Record<string, ProductUnit> = {
  kg: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  pieza: 'piece',
  pza: 'piece',
  piece: 'piece',
  manojo: 'bunch',
  bunch: 'bunch',
  bolsa: 'bag',
  bag: 'bag',
  litro: 'liter',
  lt: 'liter',
  liter: 'liter',
  caja: 'box',
  box: 'box',
};

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

function parseNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value).trim().replace(/[$,\s]/g, '');
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(value: unknown): boolean | null {
  if (value == null || value === '') return null;
  const text = String(value).trim().toLowerCase();
  if (['si', 'sí', 'yes', 'true', '1', 'visible'].includes(text)) return true;
  if (['no', 'false', '0', 'oculto'].includes(text)) return false;
  return null;
}

function parseUnit(value: unknown): ProductUnit | null {
  if (value == null || value === '') return null;
  const key = normalizeHeader(String(value));
  return UNIT_ALIASES[key] ?? (PRODUCT_UNITS.includes(key as ProductUnit) ? (key as ProductUnit) : null);
}

export function mapCostImportHeaders(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((header, index) => {
    const key = normalizeHeader(header);
    if (PRODUCT_HEADERS.includes(key)) map.productName = index;
    if (COST_HEADERS.includes(key)) map.unitCost = index;
    if (QUANTITY_HEADERS.includes(key)) map.quantity = index;
    if (PRICE_HEADERS.includes(key)) map.salePrice = index;
    if (CATEGORY_HEADERS.includes(key)) map.categoryName = index;
    if (UNIT_HEADERS.includes(key)) map.unit = index;
    if (SKU_HEADERS.includes(key)) map.sku = index;
    if (MIN_STOCK_HEADERS.includes(key)) map.minStock = index;
    if (VISIBLE_HEADERS.includes(key)) map.visible = index;
  });
  return map;
}

export function parseCostImportRows(
  rows: unknown[][],
  headerRowIndex = 0,
): { rows: ParsedCostImportRow[]; errors: string[] } {
  const errors: string[] = [];
  if (!rows.length) {
    return { rows: [], errors: ['El archivo está vacío.'] };
  }

  const headers = (rows[headerRowIndex] ?? []).map((cell) => String(cell ?? ''));
  const columnMap = mapCostImportHeaders(headers);

  if (columnMap.productName == null) {
    errors.push('Falta la columna de producto (producto, nombre).');
    return { rows: [], errors };
  }

  const parsed: ParsedCostImportRow[] = [];

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const productName = String(row[columnMap.productName!] ?? '').trim();
    if (!productName) continue;

    const unitCost =
      columnMap.unitCost != null ? parseNumber(row[columnMap.unitCost]) : null;
    const quantity =
      columnMap.quantity != null ? parseNumber(row[columnMap.quantity]) : null;
    const salePrice =
      columnMap.salePrice != null ? parseNumber(row[columnMap.salePrice]) : null;
    const minStock =
      columnMap.minStock != null ? parseNumber(row[columnMap.minStock]) : null;
    const unit =
      columnMap.unit != null ? parseUnit(row[columnMap.unit]) : null;
    const categoryName =
      columnMap.categoryName != null
        ? String(row[columnMap.categoryName] ?? '').trim() || null
        : null;
    const sku =
      columnMap.sku != null ? String(row[columnMap.sku] ?? '').trim() || null : null;
    const visible =
      columnMap.visible != null ? parseBoolean(row[columnMap.visible]) : null;

    if (unitCost != null && unitCost < 0) {
      errors.push(`Fila ${i + 1}: costo inválido para "${productName}".`);
      continue;
    }
    if (quantity != null && quantity < 0) {
      errors.push(`Fila ${i + 1}: cantidad inválida para "${productName}".`);
      continue;
    }
    if (salePrice != null && salePrice < 0) {
      errors.push(`Fila ${i + 1}: precio inválido para "${productName}".`);
      continue;
    }
    if (minStock != null && minStock < 0) {
      errors.push(`Fila ${i + 1}: mínimo de stock inválido para "${productName}".`);
      continue;
    }
    if (columnMap.unit != null && String(row[columnMap.unit] ?? '').trim() && !unit) {
      errors.push(`Fila ${i + 1}: unidad inválida para "${productName}". Usa kg, pieza, manojo, bolsa, litro o caja.`);
      continue;
    }
    if (unitCost == null && salePrice == null && quantity == null) {
      errors.push(`Fila ${i + 1}: indica costo, precio o stock para "${productName}".`);
      continue;
    }

    parsed.push({
      rowNumber: i + 1,
      productName,
      unitCost: unitCost ?? null,
      quantity: quantity ?? null,
      salePrice: salePrice ?? null,
      categoryName,
      unit,
      sku,
      minStock: minStock ?? null,
      visible,
    });
  }

  if (!parsed.length && !errors.length) {
    errors.push('No se encontraron filas de productos para importar.');
  }

  return { rows: parsed, errors };
}

export const COST_IMPORT_TEMPLATE_CSV = `producto,categoria,unidad,sku,costo,cantidad,precio,min_stock,visible
Jitomate saladette,Verduras,kg,,18.50,25,35.00,8,si
Lechuga romana,Verduras,pieza,,8.00,20,18.00,3,si
Plátano tabasco,Frutas,kg,,12.00,15,22.00,6,si
`;

export function normalizeProductName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
