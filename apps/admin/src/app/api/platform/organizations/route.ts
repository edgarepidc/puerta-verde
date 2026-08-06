import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';
import type { OnboardingInput } from '@puertaverde/shared';

import { requirePlatformAdminApi } from '@/lib/auth';
import { provisionOrganization } from '@/lib/provision';

export async function GET() {
  const auth = await requirePlatformAdminApi();
  if (auth instanceof NextResponse) return auth;

  const supabase = createAdminClient();
  const [{ data: organizations, error }, { data: branches }] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, name, slug, subscription_plan, subscription_status, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('branches').select('id, name, slug, is_active, organization_id').order('name'),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const orgsWithBranches = (organizations ?? []).map((org) => ({
    ...org,
    branches: (branches ?? []).filter((branch) => branch.organization_id === org.id),
  }));

  return NextResponse.json({ organizations: orgsWithBranches });
}

export async function POST(request: Request) {
  const auth = await requirePlatformAdminApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await request.json()) as OnboardingInput;
    const result = await provisionOrganization(body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 },
    );
  }
}
