import { NextResponse } from 'next/server';

import {
  normalizePermissionMatrixInput,
  parsePermissionsFromOrgSettings,
} from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { canEditPermissions, requireStaffApi } from '@/lib/auth';

export async function GET() {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', auth.organizationId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const matrix = parsePermissionsFromOrgSettings(data?.settings ?? {});
    return NextResponse.json({
      permissions: matrix,
      canEdit: canEditPermissions(auth),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar permisos' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  if (!canEditPermissions(auth)) {
    return NextResponse.json(
      { error: 'Solo el propietario o el gerente pueden editar permisos' },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as { permissions?: unknown };
    const matrix = normalizePermissionMatrixInput(body.permissions);
    const supabase = createAdminClient();

    const { data: current, error: readError } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', auth.organizationId)
      .single();

    if (readError) {
      return NextResponse.json({ error: readError.message }, { status: 400 });
    }

    const existing =
      current?.settings && typeof current.settings === 'object' && !Array.isArray(current.settings)
        ? (current.settings as Record<string, unknown>)
        : {};

    const nextSettings = {
      ...existing,
      permissions: matrix,
    };

    const { error: writeError } = await supabase
      .from('organizations')
      .update({ settings: nextSettings })
      .eq('id', auth.organizationId);

    if (writeError) {
      return NextResponse.json({ error: writeError.message }, { status: 400 });
    }

    return NextResponse.json({ permissions: matrix, canEdit: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al guardar permisos' },
      { status: 500 },
    );
  }
}
