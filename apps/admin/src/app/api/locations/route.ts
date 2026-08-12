import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export async function GET() {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const tenant = await getDefaultTenant();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('buildings')
    .select('id, name, units(id, identifier)')
    .eq('branch_id', tenant.branchId)
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ buildings: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const tenant = await getDefaultTenant();
  const body = (await request.json()) as {
    name?: string;
    buildingId?: string;
    identifiers?: string;
  };
  const supabase = createAdminClient();

  if (body.buildingId && body.identifiers) {
    const identifiers = body.identifiers
      .split(/[,;\n]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (!identifiers.length) {
      return NextResponse.json({ error: 'Indica al menos un departamento.' }, { status: 400 });
    }
    const { error } = await supabase.from('units').insert(
      identifiers.map((identifier) => ({
        building_id: body.buildingId!,
        identifier,
      })),
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, added: identifiers.length });
  }

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: 'El nombre de la torre es obligatorio.' }, { status: 400 });

  const { data, error } = await supabase
    .from('buildings')
    .insert({ branch_id: tenant.branchId, name })
    .select('id, name')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ building: data });
}

export async function PATCH(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const tenant = await getDefaultTenant();
  const body = (await request.json()) as { id?: string; name?: string };
  if (!body.id || !body.name?.trim()) {
    return NextResponse.json({ error: 'Falta torre o nombre.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('buildings')
    .update({ name: body.name.trim() })
    .eq('id', body.id)
    .eq('branch_id', tenant.branchId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const tenant = await getDefaultTenant();
  const { searchParams } = new URL(request.url);
  const buildingId = searchParams.get('buildingId');
  const unitId = searchParams.get('unitId');
  const supabase = createAdminClient();

  if (unitId) {
    const { error } = await supabase.from('units').delete().eq('id', unitId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (!buildingId) {
    return NextResponse.json({ error: 'Falta torre o departamento.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('buildings')
    .delete()
    .eq('id', buildingId)
    .eq('branch_id', tenant.branchId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
