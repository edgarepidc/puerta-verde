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
    .from('product_categories')
    .select('id, name, sort_order')
    .eq('organization_id', tenant.organizationId)
    .order('sort_order');

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ categories: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const tenant = await getDefaultTenant();
  const body = (await request.json()) as { name?: string; sortOrder?: number };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: 'El nombre es obligatorio.' }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('product_categories')
    .insert({
      organization_id: tenant.organizationId,
      name,
      sort_order: body.sortOrder ?? 0,
    })
    .select('id, name, sort_order')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ category: data });
}

export async function PATCH(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const tenant = await getDefaultTenant();
  const body = (await request.json()) as { id?: string; name?: string; sortOrder?: number };
  if (!body.id) return NextResponse.json({ error: 'Falta la categoría.' }, { status: 400 });

  const updates: { name?: string; sort_order?: number } = {};
  if (body.name?.trim()) updates.name = body.name.trim();
  if (typeof body.sortOrder === 'number') updates.sort_order = body.sortOrder;
  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('product_categories')
    .update(updates)
    .eq('id', body.id)
    .eq('organization_id', tenant.organizationId)
    .select('id, name, sort_order')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ category: data });
}

export async function DELETE(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const tenant = await getDefaultTenant();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta la categoría.' }, { status: 400 });

  const supabase = createAdminClient();
  await supabase
    .from('products')
    .update({ category_id: null })
    .eq('organization_id', tenant.organizationId)
    .eq('category_id', id);

  const { error } = await supabase
    .from('product_categories')
    .delete()
    .eq('id', id)
    .eq('organization_id', tenant.organizationId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
