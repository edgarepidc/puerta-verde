import { NextResponse } from 'next/server';

import { getStaffSession } from '@/lib/auth';

export async function GET() {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: 'Sin acceso al panel' }, { status: 403 });
  }
  return NextResponse.json(staff);
}
