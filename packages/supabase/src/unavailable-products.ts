import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

/** Names of cart products that are missing, in another branch, or no longer for sale. */
export async function lookupUnavailableProductNames(
  supabase: SupabaseClient<Database>,
  branchId: string,
  branchProductIds: string[],
): Promise<string[]> {
  const ids = [...new Set(branchProductIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const { data } = await supabase
    .from('branch_products')
    .select('id, branch_id, is_available, product:products(name)')
    .in('id', ids);

  const names: string[] = [];
  for (const row of data ?? []) {
    if (row.branch_id === branchId && row.is_available) continue;
    const product = row.product as { name: string } | null;
    if (product?.name) names.push(product.name);
  }
  return names;
}
