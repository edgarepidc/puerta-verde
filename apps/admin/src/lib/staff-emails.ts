import { createAdminClient } from '@puertaverde/supabase/admin';

export async function emailsByUserId(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;

  const wanted = new Set(userIds);
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) return map;

  for (const user of data.users) {
    if (wanted.has(user.id) && user.email) map.set(user.id, user.email);
  }
  return map;
}
