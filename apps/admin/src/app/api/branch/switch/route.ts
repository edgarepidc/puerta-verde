import { NextResponse } from 'next/server';

import { requireStaffApi } from '@/lib/auth';

const BRANCH_COOKIE = 'pv_branch_id';

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const { branchId } = (await request.json()) as { branchId: string };
  if (!branchId) {
    return NextResponse.json({ error: 'Sucursal requerida' }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(BRANCH_COOKIE, branchId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}
