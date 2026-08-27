import * as XLSX from 'xlsx';

import {
  COST_IMPORT_TEMPLATE_CSV,
  getDefaultLowStockThreshold,
  normalizeProductName,
  parseCostImportRows,
  type ParsedCostImportRow,
  type ProductUnit,
} from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

export interface BranchProductMatch {
  branchProductId: string;
  productName: string;
  currentPrice: number;
}

export interface CostImportPreviewRow extends ParsedCostImportRow {
  matched: boolean;
  willCreate: boolean;
  branchProductId?: string;
  matchedProductName?: string;
  currentPrice?: number;
}

export function parseCostSpreadsheet(buffer: ArrayBuffer): { rows: ParsedCostImportRow[]; errors: string[] } {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], errors: ['El archivo no contiene hojas.'] };
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
  });

  return parseCostImportRows(matrix as unknown[][]);
}

export function buildProductIndex(
  products: Array<{ id: string; price: number; product: { name: string } | null }>,
): Map<string, BranchProductMatch> {
  const index = new Map<string, BranchProductMatch>();

  for (const row of products) {
    const name = row.product?.name;
    if (!name) continue;
    const key = normalizeProductName(name);
    index.set(key, {
      branchProductId: row.id,
      productName: name,
      currentPrice: Number(row.price),
    });
  }

  return index;
}

export function matchCostImportRows(
  rows: ParsedCostImportRow[],
  index: Map<string, BranchProductMatch>,
): CostImportPreviewRow[] {
  return rows.map((row) => {
    const exact = index.get(normalizeProductName(row.productName));
    if (exact) {
      return {
        ...row,
        matched: true,
        willCreate: false,
        branchProductId: exact.branchProductId,
        matchedProductName: exact.productName,
        currentPrice: exact.currentPrice,
      };
    }

    return { ...row, matched: false, willCreate: true };
  });
}

async function ensureCategory(
  supabase: ReturnType<typeof createAdminClient>,
  organizationId: string,
  name: string,
  cache: Map<string, string>,
): Promise<string | null> {
  const key = normalizeProductName(name);
  const cached = cache.get(key);
  if (cached) return cached;

  const { data: existing } = await supabase
    .from('product_categories')
    .select('id, name')
    .eq('organization_id', organizationId);

  for (const category of existing ?? []) {
    cache.set(normalizeProductName(category.name), category.id);
  }
  const afterScan = cache.get(key);
  if (afterScan) return afterScan;

  const { data: created, error } = await supabase
    .from('product_categories')
    .insert({
      organization_id: organizationId,
      name: name.trim(),
      sort_order: (existing?.length ?? 0) + 1,
    })
    .select('id')
    .single();

  if (error || !created) throw new Error(error?.message ?? `No se pudo crear la categoría ${name}`);
  cache.set(key, created.id);
  return created.id;
}

export async function applyCostImportRows(
  branchId: string,
  organizationId: string,
  rows: CostImportPreviewRow[],
): Promise<{ imported: number; created: number; failed: Array<{ rowNumber: number; productName: string; error: string }> }> {
  const supabase = createAdminClient();
  const failed: Array<{ rowNumber: number; productName: string; error: string }> = [];
  let imported = 0;
  let created = 0;
  const categoryCache = new Map<string, string>();

  for (const row of rows) {
    try {
      let branchProductId = row.branchProductId;

      if (!branchProductId && row.willCreate) {
        if (row.salePrice == null || row.salePrice < 0) {
          throw new Error('Los productos nuevos necesitan precio de venta');
        }

        let categoryId: string | null = null;
        if (row.categoryName?.trim()) {
          categoryId = await ensureCategory(supabase, organizationId, row.categoryName, categoryCache);
        }

        const { data: product, error: productError } = await supabase
          .from('products')
          .insert({
            organization_id: organizationId,
            category_id: categoryId,
            name: row.productName.trim(),
            unit: (row.unit ?? 'kg') as ProductUnit,
            sku: row.sku?.trim() || null,
            is_active: true,
          })
          .select('id')
          .single();

        if (productError || !product) {
          throw new Error(productError?.message ?? 'No se pudo crear el producto');
        }

        const { data: branchProduct, error: branchError } = await supabase
          .from('branch_products')
          .insert({
            branch_id: branchId,
            product_id: product.id,
            price: row.salePrice,
            stock: 0,
            avg_unit_cost: row.unitCost ?? 0,
            last_unit_cost: row.unitCost ?? null,
            min_stock:
              row.minStock ??
              getDefaultLowStockThreshold({
                unit: row.unit ?? 'kg',
                name: row.productName,
                categoryName: row.categoryName,
              }),
            is_available: row.visible ?? true,
          })
          .select('id')
          .single();

        if (branchError || !branchProduct) {
          await supabase.from('products').delete().eq('id', product.id);
          throw new Error(branchError?.message ?? 'No se pudo asignar a la sucursal');
        }

        branchProductId = branchProduct.id;
        created += 1;

        if (row.quantity != null && row.quantity > 0) {
          const { error } = await supabase.rpc('record_inventory_movement', {
            p_branch_product_id: branchProductId,
            p_movement_type: row.unitCost != null && row.unitCost > 0 ? 'purchase' : 'adjustment',
            p_quantity: row.quantity,
            p_notes: 'Inventario inicial (importación)',
            p_expires_at: null,
            p_unit_cost: row.unitCost ?? null,
          });
          if (error) throw new Error(error.message);
        }

        imported += 1;
        continue;
      }

      if (!branchProductId) {
        throw new Error('Producto no encontrado en la sucursal');
      }

      if (row.quantity != null && row.quantity > 0) {
        const { error } = await supabase.rpc('record_inventory_movement', {
          p_branch_product_id: branchProductId,
          p_movement_type: row.unitCost != null && row.unitCost > 0 ? 'purchase' : 'adjustment',
          p_quantity: row.quantity,
          p_notes: 'Importación de catálogo desde Excel',
          p_expires_at: null,
          p_unit_cost: row.unitCost ?? null,
        });
        if (error) throw new Error(error.message);
      } else if (row.unitCost != null) {
        const { error } = await supabase
          .from('branch_products')
          .update({
            avg_unit_cost: row.unitCost,
            last_unit_cost: row.unitCost,
          })
          .eq('id', branchProductId)
          .eq('branch_id', branchId);
        if (error) throw new Error(error.message);
      }

      const updates: { price?: number; min_stock?: number; is_available?: boolean } = {};
      if (row.salePrice != null) updates.price = row.salePrice;
      if (row.minStock != null) updates.min_stock = row.minStock;
      if (row.visible != null) updates.is_available = row.visible;
      if (Object.keys(updates).length) {
        const { error } = await supabase
          .from('branch_products')
          .update(updates)
          .eq('id', branchProductId)
          .eq('branch_id', branchId);
        if (error) throw new Error(error.message);
      }

      imported += 1;
    } catch (error) {
      failed.push({
        rowNumber: row.rowNumber,
        productName: row.productName,
        error: error instanceof Error ? error.message : 'Error al importar',
      });
    }
  }

  return { imported, created, failed };
}

export function costImportTemplateResponse() {
  return new Response(COST_IMPORT_TEMPLATE_CSV, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="plantilla-catalogo.csv"',
    },
  });
}
