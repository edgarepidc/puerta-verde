import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export async function GET(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const { searchParams } = new URL(request.url);
    const horizonDays = Number(searchParams.get('days') ?? 7);

    const supabase = createAdminClient();
    const { data: forecast, error } = await supabase.rpc('get_restock_forecast', {
      p_branch_id: tenant.branchId,
      p_horizon_days: horizonDays,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ forecast: forecast ?? [], horizonDays });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al calcular pronóstico' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await request.json()) as { horizonDays?: number };
    const horizonDays = body.horizonDays ?? 7;

    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();
    const { data: forecast, error } = await supabase.rpc('get_restock_forecast', {
      p_branch_id: tenant.branchId,
      p_horizon_days: horizonDays,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const rows = forecast ?? [];
    const topReorder = rows
      .filter((r: { suggested_reorder: number }) => Number(r.suggested_reorder) > 0)
      .slice(0, 8);

    const summary = topReorder
      .map(
        (r: { product_name: string; suggested_reorder: number; days_until_stockout: number | null }) =>
          `- ${r.product_name}: reponer ~${Number(r.suggested_reorder).toFixed(1)}${
            r.days_until_stockout != null ? ` (agota en ~${r.days_until_stockout} días)` : ''
          }`,
      )
      .join('\n');

    const apiKey = process.env.FORECAST_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
    let insights: string;

    if (apiKey && summary) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.3,
          messages: [
            {
              role: 'system',
              content:
                'Eres un asistente de inventario para una verdulería en México. Responde en español con 3 recomendaciones accionables y breves.',
            },
            {
              role: 'user',
              content: `Pronóstico a ${horizonDays} días:\n${summary || 'Sin reposiciones urgentes detectadas.'}`,
            },
          ],
        }),
      });

      if (response.ok) {
        const payload = await response.json();
        insights = payload.choices?.[0]?.message?.content ?? 'Sin recomendaciones IA.';
      } else {
        insights = buildHeuristicInsights(topReorder, horizonDays);
      }
    } else {
      insights = buildHeuristicInsights(topReorder, horizonDays);
    }

    return NextResponse.json({ insights, forecast: rows });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al generar insights' },
      { status: 500 },
    );
  }
}

function buildHeuristicInsights(
  rows: Array<{ product_name: string; suggested_reorder: number; days_until_stockout: number | null }>,
  horizonDays: number,
): string {
  if (!rows.length) {
    return `No hay reposiciones urgentes para los próximos ${horizonDays} días según el promedio de ventas de las últimas 2 semanas.`;
  }
  const lines = rows.slice(0, 3).map((r, i) => {
    const urgency =
      r.days_until_stockout != null && r.days_until_stockout <= 2
        ? 'Prioridad alta'
        : 'Planificar compra';
    return `${i + 1}. ${urgency}: reponer ${r.product_name} (~${Number(r.suggested_reorder).toFixed(1)} unidades).`;
  });
  return lines.join('\n');
}
