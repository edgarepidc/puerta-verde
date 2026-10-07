import { NextResponse } from 'next/server';

import { normalizeStorefrontSlug, storefrontInputError } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export async function PUT(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'branch.settings',
    'No tienes permiso para editar la tienda',
  );
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      name?: string;
      slug?: string;
      markupPercent?: number;
      isActive?: boolean;
    };
    const name = body.name?.trim() ?? '';
    const slug = normalizeStorefrontSlug(body.slug ?? '');
    const markupPercent = Number(body.markupPercent);
    const isActive = body.isActive !== false;
    const validation = storefrontInputError({ name, slug, markupPercent });
    if (validation) {
      return NextResponse.json({ error: validation }, { status: 400 });
    }

    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();

    const { data: branchHit } = await supabase
      .from('branches')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (branchHit) {
      return NextResponse.json(
        { error: 'Esa liga ya es de una tienda. Elige otra.' },
        { status: 409 },
      );
    }

    const { data: slugHit } = await supabase
      .from('storefronts')
      .select('id, branch_id')
      .eq('slug', slug)
      .maybeSingle();
    if (slugHit && slugHit.branch_id !== tenant.branchId) {
      return NextResponse.json({ error: 'Esa liga ya está en uso. Elige otra.' }, { status: 409 });
    }

    const row = {
      name,
      slug,
      markup_percent: markupPercent,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from('storefronts')
      .select('id')
      .eq('branch_id', tenant.branchId)
      .maybeSingle();

    const { data, error } = existing
      ? await supabase
          .from('storefronts')
          .update(row)
          .eq('id', existing.id)
          .select('id, name, slug, markup_percent, is_active')
          .single()
      : await supabase
          .from('storefronts')
          .insert({ ...row, branch_id: tenant.branchId })
          .select('id, name, slug, markup_percent, is_active')
          .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'No se pudo guardar' }, { status: 400 });
    }

    return NextResponse.json({ storefront: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al guardar' },
      { status: 500 },
    );
  }
}
