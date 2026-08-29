import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

import { buildSalesExportTables, mexicoYmdFromIso, salesExportFilename } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import {
  isValidYmd,
  mexicoYmdBoundsIso,
  todayMexicoYmd,
} from '@/lib/mexico-date';

const ORDER_SELECT =
  'id, order_number, customer_name, customer_phone, fulfillment_type, payment_method, payment_status, source, total, created_at';

function sheetFromRows(rows: object[]): XLSX.WorkSheet {
  if (rows.length === 0) return XLSX.utils.aoa_to_sheet([['Sin ventas en el periodo']]);
  return XLSX.utils.json_to_sheet(rows);
}

function parseSelectedDates(searchParams: URLSearchParams): string[] | null {
  const raw = [
    ...searchParams.getAll('date').flatMap((value) => value.split(',')),
    ...(searchParams.get('dates') ?? '').split(','),
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  if (raw.length === 0) return null;

  const unique = [...new Set(raw)].sort();
  if (unique.some((ymd) => !isValidYmd(ymd))) {
    throw new Error('Fecha no válida');
  }
  return unique;
}

async function fetchItemsForOrders(
  supabase: ReturnType<typeof createAdminClient>,
  orderIds: string[],
) {
  const items: Array<{
    order_id: string;
    product_name: string;
    unit: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }> = [];

  const chunkSize = 100;
  for (let i = 0; i < orderIds.length; i += chunkSize) {
    const chunk = orderIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('order_items')
      .select('order_id, product_name, unit, quantity, unit_price, line_total')
      .in('order_id', chunk)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    items.push(...(data ?? []));
  }

  return items;
}

export async function GET(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(auth, 'sales.export', 'No tienes permiso para exportar ventas');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(Number(searchParams.get('days') ?? 30), 1), 365);
    let selectedDates: string[] | null = null;
    try {
      selectedDates = parseSelectedDates(searchParams);
    } catch {
      return NextResponse.json({ error: 'Fecha no válida' }, { status: 400 });
    }

    const supabase = createAdminClient();
    let query = supabase
      .from('orders')
      .select(ORDER_SELECT)
      .eq('branch_id', auth.branchId)
      .eq('status', 'delivered')
      .order('created_at', { ascending: false });

    if (selectedDates && selectedDates.length > 0) {
      const start = mexicoYmdBoundsIso(selectedDates[0]).start;
      const end = mexicoYmdBoundsIso(selectedDates[selectedDates.length - 1]).end;
      query = query.gte('created_at', start).lt('created_at', end);
    } else {
      const probe = new Date(`${todayMexicoYmd()}T12:00:00-06:00`);
      probe.setDate(probe.getDate() - days);
      query = query.gte('created_at', probe.toISOString());
    }

    const { data: orders, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const selectedSet = selectedDates ? new Set(selectedDates) : null;
    const rows = (orders ?? []).filter((order) => {
      if (!selectedSet) return true;
      return selectedSet.has(mexicoYmdFromIso(order.created_at));
    });

    const items = await fetchItemsForOrders(
      supabase,
      rows.map((order) => order.id),
    );
    const tables = buildSalesExportTables(rows, items);
    const workbook = XLSX.utils.book_new();
    const cover = XLSX.utils.aoa_to_sheet([
      ['Respaldo de ventas', auth.branchName],
      ['Generado', new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })],
      selectedDates
        ? ['Días', selectedDates.join(', ')]
        : ['Periodo (días)', days],
      ['Ventas', tables.sales.length],
      ['Total', tables.byDay.reduce((sum, day) => sum + day.Total, 0)],
    ]);
    XLSX.utils.book_append_sheet(workbook, cover, 'Resumen');
    XLSX.utils.book_append_sheet(workbook, sheetFromRows(tables.byDay), 'Por día');
    XLSX.utils.book_append_sheet(workbook, sheetFromRows(tables.sales), 'Ventas');
    XLSX.utils.book_append_sheet(workbook, sheetFromRows(tables.items), 'Partidas');

    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const filename = salesExportFilename({
      branchSlug: auth.branchSlug,
      dates: selectedDates ?? undefined,
      days,
    });

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo exportar' },
      { status: 500 },
    );
  }
}
