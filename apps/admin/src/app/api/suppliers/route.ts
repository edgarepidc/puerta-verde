import { NextResponse } from 'next/server';

import { validateSupplierInput, type SupplierInput } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export async function GET() {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('suppliers')
      .select('id, name, phone, notes, is_active, created_at')
      .eq('organization_id', tenant.organizationId)
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ suppliers: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar proveedores' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const body = (await request.json()) as SupplierInput & { id?: string };
    const validationError = validateSupplierInput(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const supabase = createAdminClient();
    const payload = {
      organization_id: tenant.organizationId,
      name: body.name.trim(),
      phone: body.phone?.trim() || null,
      notes: body.notes?.trim() || null,
      is_active: body.isActive ?? true,
    };

    if (body.id) {
      const { data, error } = await supabase
        .from('suppliers')
        .update(payload)
        .eq('id', body.id)
        .eq('organization_id', tenant.organizationId)
        .select('id, name, phone, notes, is_active, created_at')
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ supplier: data });
    }

    const { data, error } = await supabase
      .from('suppliers')
      .insert(payload)
      .select('id, name, phone, notes, is_active, created_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ supplier: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al guardar proveedor' },
      { status: 500 },
    );
  }
}
