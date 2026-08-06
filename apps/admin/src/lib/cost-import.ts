import * as XLSX from 'xlsx';

import {
  COST_IMPORT_TEMPLATE_CSV,
  normalizeProductName,
  parseCostImportRows,
  type ParsedCostImportRow,
} from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

export interface BranchProductMatch {
  branchProductId: string;
  productName: string;
  currentPrice: number;
}

export interface CostImportPreviewRow extends ParsedCostImportRow {
  matched: boolean;
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
        branchProductId: exact.branchProductId,
        matchedProductName: exact.productName,
        currentPrice: exact.currentPrice,
      };
    }

    const normalized = normalizeProductName(row.productName);
    const fuzzy = [...index.values()].find((candidate) => {
      const candidateKey = normalizeProductName(candidate.productName);
      return candidateKey.includes(normalized) || normalized.includes(candidateKey);
    });

    if (fuzzy) {
      return {
        ...row,
        matched: true,
        branchProductId: fuzzy.branchProductId,
        matchedProductName: fuzzy.productName,
        currentPrice: fuzzy.currentPrice,
      };
    }

    return { ...row, matched: false };
  });
}

export async function applyCostImportRows(
  branchId: string,
  rows: CostImportPreviewRow[],
): Promise<{ imported: number; failed: Array<{ rowNumber: number; productName: string; error: string }> }> {
  const supabase = createAdminClient();
  const failed: Array<{ rowNumber: number; productName: string; error: string }> = [];
  let imported = 0;

  for (const row of rows) {
    if (!row.matched || !row.branchProductId) {
      failed.push({
        rowNumber: row.rowNumber,
        productName: row.productName,
        error: 'Producto no encontrado en la sucursal',
      });
      continue;
    }

    try {
      if (row.quantity != null && row.quantity > 0) {
        const { error } = await supabase.rpc('record_inventory_movement', {
          p_branch_product_id: row.branchProductId,
          p_movement_type: 'purchase',
          p_quantity: row.quantity,
          p_notes: 'Importación de costos desde Excel',
          p_expires_at: null,
          p_unit_cost: row.unitCost,
        });
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from('branch_products')
          .update({
            avg_unit_cost: row.unitCost,
            last_unit_cost: row.unitCost,
          })
          .eq('id', row.branchProductId)
          .eq('branch_id', branchId);
        if (error) throw new Error(error.message);
      }

      if (row.salePrice != null) {
        const { error } = await supabase
          .from('branch_products')
          .update({ price: row.salePrice })
          .eq('id', row.branchProductId)
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

  return { imported, failed };
}

export function costImportTemplateResponse() {
  return new Response(COST_IMPORT_TEMPLATE_CSV, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="plantilla-costos.csv"',
    },
  });
}
