import { NextResponse } from 'next/server';

import type { ParsedCostImportRow } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';
import {
  applyCostImportRows,
  buildProductIndex,
  costImportTemplateResponse,
  matchCostImportRows,
  parseCostSpreadsheet,
  type CostImportPreviewRow,
} from '@/lib/cost-import';
import { getDefaultTenant } from '@/lib/tenant';

export async function GET(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  if (searchParams.get('template') === '1') {
    return costImportTemplateResponse();
  }

  return NextResponse.json({ error: 'Usa ?template=1 para descargar la plantilla.' }, { status: 400 });
}

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const preview = searchParams.get('preview') === '1';

    const contentType = request.headers.get('content-type') ?? '';
    let parsedRows: ParsedCostImportRow[] = [];
    let parseErrors: string[] = [];
    let previewRows: CostImportPreviewRow[] = [];

    if (contentType.includes('application/json')) {
      const body = (await request.json()) as { rows?: CostImportPreviewRow[] };
      previewRows = body.rows ?? [];
    } else {
      const formData = await request.formData();
      const file = formData.get('file');
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'Sube un archivo Excel o CSV.' }, { status: 400 });
      }

      const buffer = await file.arrayBuffer();
      const parsed = parseCostSpreadsheet(buffer);
      parsedRows = parsed.rows;
      parseErrors = parsed.errors;

      if (parseErrors.length && !parsedRows.length) {
        return NextResponse.json({ rows: [], parseErrors }, { status: 400 });
      }
    }

    const { data: branchProducts, error: productsError } = await supabase
      .from('branch_products')
      .select('id, price, product:products ( name )')
      .eq('branch_id', tenant.branchId);

    if (productsError) {
      return NextResponse.json({ error: productsError.message }, { status: 400 });
    }

    const index = buildProductIndex(
      (branchProducts ?? []) as Array<{
        id: string;
        price: number;
        product: { name: string } | null;
      }>,
    );

    if (!previewRows.length) {
      previewRows = matchCostImportRows(parsedRows, index);
    }

    if (preview) {
      return NextResponse.json({
        rows: previewRows,
        parseErrors,
        matchedCount: previewRows.filter((row) => row.matched).length,
        totalCount: previewRows.length,
      });
    }

    const readyRows = previewRows.filter((row) => row.matched);
    if (!readyRows.length) {
      return NextResponse.json(
        { error: 'No hay filas válidas para importar. Revisa los nombres de producto.' },
        { status: 400 },
      );
    }

    const result = await applyCostImportRows(tenant.branchId, readyRows);
    return NextResponse.json({
      ...result,
      skipped: previewRows.length - readyRows.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al importar costos' },
      { status: 500 },
    );
  }
}
