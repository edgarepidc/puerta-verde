import { NextResponse } from 'next/server';

/** Public onboarding disabled. Use admin /api/platform/organizations as platform admin. */
export async function POST() {
  return NextResponse.json(
    { error: 'El registro público está deshabilitado. Contacta a Puerta Verde para abrir tu verdulería.' },
    { status: 403 },
  );
}
