import {
  slugifyOrganizationName,
  validateOnboardingInput,
  type OnboardingInput,
} from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

const DEFAULT_CATEGORIES = ['Frutas', 'Verduras', 'Semillas y granos'];

export interface ProvisionResult {
  organizationId: string;
  organizationSlug: string;
  branchId: string;
  branchSlug: string;
  ownerUserId: string;
  storeUrl: string;
  adminUrl: string;
}

export async function provisionOrganization(
  input: OnboardingInput,
): Promise<{ ok: true; data: ProvisionResult } | { ok: false; error: string; status: number }> {
  const validationError = validateOnboardingInput(input);
  if (validationError) {
    return { ok: false, error: validationError, status: 400 };
  }

  const orgSlug = slugifyOrganizationName(input.organizationName);
  const supabase = createAdminClient();

  const [{ data: existingOrg }, { data: existingBranch }] = await Promise.all([
    supabase.from('organizations').select('id').eq('slug', orgSlug).maybeSingle(),
    supabase.from('branches').select('id').eq('slug', input.branchSlug).maybeSingle(),
  ]);

  if (existingOrg) {
    return { ok: false, error: 'Ya existe una verdulería con un nombre similar.', status: 409 };
  }
  if (existingBranch) {
    return { ok: false, error: 'Ese slug de tienda ya está en uso.', status: 409 };
  }

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({
      name: input.organizationName.trim(),
      slug: orgSlug,
      subscription_plan: 'basic',
      subscription_status: 'trialing',
    })
    .select('id, slug')
    .single();

  if (orgError || !org) {
    return { ok: false, error: orgError?.message ?? 'No se pudo crear la organización', status: 400 };
  }

  const { data: branch, error: branchError } = await supabase
    .from('branches')
    .insert({
      organization_id: org.id,
      name: input.branchName.trim(),
      slug: input.branchSlug,
      pickup_instructions: 'Pasa a recoger en el local.',
      delivery_fee: 0,
      minimum_order_amount: 50,
    })
    .select('id, slug')
    .single();

  if (branchError || !branch) {
    await supabase.from('organizations').delete().eq('id', org.id);
    return { ok: false, error: branchError?.message ?? 'No se pudo crear la sucursal', status: 400 };
  }

  const categories = DEFAULT_CATEGORIES.map((name, index) => ({
    organization_id: org.id,
    name,
    sort_order: index + 1,
  }));
  await supabase.from('product_categories').insert(categories);

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.ownerName.trim() },
  });

  if (authError || !authUser.user) {
    await supabase.from('branches').delete().eq('id', branch.id);
    await supabase.from('organizations').delete().eq('id', org.id);
    return { ok: false, error: authError?.message ?? 'No se pudo crear el usuario', status: 400 };
  }

  await supabase.from('profiles').upsert({
    id: authUser.user.id,
    full_name: input.ownerName.trim(),
  });

  const { error: membershipError } = await supabase.from('staff_memberships').insert({
    user_id: authUser.user.id,
    organization_id: org.id,
    branch_id: branch.id,
    role: 'owner',
    status: 'active',
  });

  if (membershipError) {
    await supabase.auth.admin.deleteUser(authUser.user.id);
    await supabase.from('branches').delete().eq('id', branch.id);
    await supabase.from('organizations').delete().eq('id', org.id);
    return { ok: false, error: membershipError.message, status: 400 };
  }

  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://puerta-verde-admin.vercel.app';
  const webUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://puerta-verde-web.vercel.app';

  return {
    ok: true,
    data: {
      organizationId: org.id,
      organizationSlug: org.slug,
      branchId: branch.id,
      branchSlug: branch.slug,
      ownerUserId: authUser.user.id,
      storeUrl: `${webUrl}/${branch.slug}`,
      adminUrl: `${adminUrl}/login`,
    },
  };
}
