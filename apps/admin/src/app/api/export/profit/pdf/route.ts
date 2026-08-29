import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { fetchProfitReport, profitSummaryLines } from '@/lib/profit-report';

export async function GET(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'profit.view',
    'No tienes permiso para ver utilidades',
  );
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  let report;
  try {
    report = await fetchProfitReport(auth.branchId, searchParams.get('from'), searchParams.get('to'));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Rango inválido' },
      { status: 400 },
    );
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([612, 792]);
  let y = 760;
  const left = 48;

  function writeln(text: string, size = 11, useBold = false) {
    if (y < 60) {
      page = pdf.addPage([612, 792]);
      y = 760;
    }
    page.drawText(text, {
      x: left,
      y,
      size,
      font: useBold ? bold : font,
      color: rgb(0.08, 0.16, 0.12),
    });
    y -= size + 6;
  }

  writeln('Puerta Verde — Utilidades', 16, true);
  for (const line of profitSummaryLines(report.summary, auth.branchName, report.periodLabel)) {
    writeln(line);
  }

  writeln('', 8);
  writeln('Utilidad por categoría', 13, true);
  for (const row of report.categories.slice(0, 12)) {
    writeln(
      `${row.category_name}: ${formatMoney(row.revenue)} ventas · ${formatMoney(row.gross_profit)} utilidad · ${row.gross_margin_percent}%`,
      10,
    );
  }

  writeln('', 8);
  writeln('Top márgenes por producto', 13, true);
  for (const row of report.margins.slice(0, 15)) {
    writeln(
      `${row.product_name}: ${formatMoney(row.sale_price)} venta · ${row.margin_percent}% margen`,
      10,
    );
  }

  const bytes = await pdf.save();

  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="utilidades-${auth.branchSlug}-${report.from}_${report.to}.pdf"`,
    },
  });
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
}
