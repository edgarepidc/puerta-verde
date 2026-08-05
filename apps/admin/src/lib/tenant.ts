import { createAdminClient } from '@puertaverde/supabase/admin';

export interface TenantContext {
  organizationId: string;
  organizationName: string;
  branchId: string;
  branchName: string;
  branchSlug: string;
}

export async function getDefaultTenant(): Promise<TenantContext> {
  const supabase = createAdminClient();
  const branchSlug = process.env.DEFAULT_BRANCH_SLUG ?? 'puerta-verde-demo';

  const { data: branch, error } = await supabase
    .from('branches')
    .select('id, name, slug, organization_id')
    .eq('slug', branchSlug)
    .single();

  if (error || !branch) {
    throw new Error('No se encontró la sucursal activa.');
  }

  const { data: org } = await supabase
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
