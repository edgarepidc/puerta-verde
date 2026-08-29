import { cookies } from 'next/headers';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface TenantContext {
  organizationId: string;
  organizationName: string;
  branchId: string;
  branchName: string;
  branchSlug: string;
}

const BRANCH_COOKIE = 'pv_branch_id';

export async function resolveTenantForUser(userId: string): Promise<TenantContext | null> {
  const supabase = createAdminClient();
  const cookieStore = await cookies();
  const preferredBranchId = cookieStore.get(BRANCH_COOKIE)?.value;

  const { data: memberships } = await supabase
    .from('staff_memberships')
    .select('organization_id, branch_id, role')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  const membership = memberships?.[0];
  if (!membership) return null;

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', membership.organization_id)
    .single();

  if (!org) return null;

  let branch = null as { id: string; name: string; slug: string } | null;

  if (preferredBranchId) {
    const { data } = await supabase
      .from('branches')
      .select('id, name, slug')
      .eq('id', preferredBranchId)
      .eq('organization_id', org.id)
      .maybeSingle();
    branch = data;
  }

  if (!branch && membership.branch_id) {
    const { data } = await supabase
      .from('branches')
      .select('id, name, slug')
      .eq('id', membership.branch_id)
      .maybeSingle();
    branch = data;
  }

  if (!branch) {
    const { data } = await supabase
      .from('branches')
      .select('id, name, slug')
      .eq('organization_id', org.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    branch = data;
  }

  if (!branch) return null;

  return {
    organizationId: org.id,
    organizationName: org.name,
    branchId: branch.id,
    branchName: branch.name,
    branchSlug: branch.slug,
  };
}

export async function getDefaultTenant(): Promise<TenantContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const tenant = await resolveTenantForUser(user.id);
    if (tenant) return tenant;
  }

  const admin = createAdminClient();
  const branchSlug = process.env.DEFAULT_BRANCH_SLUG ?? 'la-cite';

  const { data: branch, error } = await admin
    .from('branches')
    .select('id, name, slug, organization_id')
    .eq('slug', branchSlug)
    .single();

  if (error || !branch) {
    throw new Error('No se encontró la sucursal activa.');
  }

  const { data: org } = await admin
    .from('organizations')
    .select('id, name')
    .eq('id', branch.organization_id)
    .single();

  if (!org) {
    throw new Error('No se encontró la organización.');
  }

  return {
    organizationId: org.id,
    organizationName: org.name,
    branchId: branch.id,
    branchName: branch.name,
    branchSlug: branch.slug,
  };
}

export async function listBranchesForUser(userId: string) {
  const supabase = createAdminClient();
  const { data: memberships } = await supabase
    .from('staff_memberships')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('status', 'active');

  const orgIds = [...new Set((memberships ?? []).map((row) => row.organization_id))];
  if (orgIds.length === 0) return [];

  const { data } = await supabase
    .from('branches')
    .select('id, name, slug, organization_id')
    .in('organization_id', orgIds)
    .eq('is_active', true)
    .order('name');

  return data ?? [];
}
