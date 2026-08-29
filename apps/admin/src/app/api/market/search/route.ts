import { NextResponse } from 'next/server';

import { requireStaffApi } from '@/lib/auth';
import { searchMarketPrices } from '@/lib/market-search';

export const maxDuration = 20;

export async function GET(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim() ?? '';
    if (query.length < 2) {
      return NextResponse.json({ error: 'Escribe al menos 2 letras para buscar.' }, { status: 400 });
    }

    const result = await searchMarketPrices(query);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudieron consultar precios' },
      { status: 500 },
    );
  }
}
