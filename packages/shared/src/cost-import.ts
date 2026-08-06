export interface CostImportRow {
  productName: string;
  unitCost: number;
  quantity?: number | null;
  salePrice?: number | null;
}

export interface ParsedCostImportRow extends CostImportRow {
  rowNumber: number;
}

const PRODUCT_HEADERS = ['producto', 'nombre', 'product', 'name', 'articulo', 'artículo'];
const COST_HEADERS = ['costo', 'costo_unitario', 'costo_compra', 'costo unitario', 'unit_cost', 'unit cost'];
const QUANTITY_HEADERS = ['cantidad', 'quantity', 'qty', 'stock'];
const PRICE_HEADERS = ['precio', 'precio_venta', 'precio venta', 'price', 'sale_price', 'venta'];

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

export function mapCostImportHeaders(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((header, index) => {
    const key = normalizeHeader(header);
    if (PRODUCT_HEADERS.includes(key)) map.productName = index;
    if (COST_HEADERS.includes(key)) map.unitCost = index;
    if (QUANTITY_HEADERS.includes(key)) map.quantity = index;
    if (PRICE_HEADERS.includes(key)) map.salePrice = index;
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
  }
  if (columnMap.unitCost == null) {
    errors.push('Falta la columna de costo (costo, costo_unitario).');
  }
  if (errors.length) {
    return { rows: [], errors };
  }

  const parsed: ParsedCostImportRow[] = [];

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const productName = String(row[columnMap.productName!] ?? '').trim();
    if (!productName) continue;

    const unitCost = parseNumber(row[columnMap.unitCost!]);
    if (unitCost == null || unitCost < 0) {
      errors.push(`Fila ${i + 1}: costo inválido para "${productName}".`);
      continue;
    }

    const quantity =
      columnMap.quantity != null ? parseNumber(row[columnMap.quantity]) : null;
    const salePrice =
      columnMap.salePrice != null ? parseNumber(row[columnMap.salePrice]) : null;

    if (quantity != null && quantity < 0) {
      errors.push(`Fila ${i + 1}: cantidad inválida para "${productName}".`);
      continue;
    }
    if (salePrice != null && salePrice < 0) {
      errors.push(`Fila ${i + 1}: precio inválido para "${productName}".`);
      continue;
    }

    parsed.push({
      rowNumber: i + 1,
      productName,
      unitCost,
      quantity: quantity ?? null,
      salePrice: salePrice ?? null,
    });
  }

  if (!parsed.length && !errors.length) {
    errors.push('No se encontraron filas de productos para importar.');
  }

  return { rows: parsed, errors };
}

export const COST_IMPORT_TEMPLATE_CSV = `producto,costo,cantidad,precio
Aguacate Hass,55.00,10,89.00
Jitomate saladette,18.50,25,35.00
Lechuga romana,8.00,,18.00
`;

export function normalizeProductName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
