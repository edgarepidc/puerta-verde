import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { createAdminClient } from '@puertaverde/supabase/admin';
import type { PromotionKind } from '@puertaverde/shared';

import { AdminShell } from '@/components/AdminShell';
import { AjustesNav } from '@/components/AjustesNav';
import { CouponsManager } from '@/components/CouponsManager';
import { PromotionsManager } from '@/components/PromotionsManager';
import { PromotionsTabs } from '@/components/PromotionsTabs';
import { getStaffSession, loadPermissionMatrix, staffHasPermission } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export default async function PromotionsPage() {
  const staff = await getStaffSession();
  if (!staff) redirect('/login');

  const tenant = await getDefaultTenant();
  const permissionMatrix = await loadPermissionMatrix(staff.organizationId);
  const canManagePromotions = staffHasPermission(staff, 'promotions.manage', permissionMatrix);
  const canManageCoupons = staffHasPermission(staff, 'coupons.manage', permissionMatrix);
  const supabase = createAdminClient();

  const [{ data: promotions }, { data: products }, { data: categories }, { data: coupons }] =
    await Promise.all([
      supabase
        .from('promotions')
        .select('*')
        .eq('branch_id', tenant.branchId)
        .order('created_at', { ascending: false }),
      supabase
        .from('products')
        .select('id, name')
        .eq('organization_id', tenant.organizationId)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('product_categories')
        .select('id, name')
        .eq('organization_id', tenant.organizationId)
        .order('sort_order'),
      supabase
        .from('coupons')
        .select(
          'id, code, description, discount_type, discount_value, starts_at, ends_at, is_active, max_uses, times_used, min_order_amount, created_at',
        )
        .eq('branch_id', tenant.branchId)
        .order('created_at', { ascending: false })
        .then((result) => (result.error ? { data: [] as never[], error: result.error } : result)),
    ]);

  return (
    <AdminShell title="Ajustes" subtitle={`Promos · ${tenant.branchName}`}>
      <div className="space-y-6">
        <AjustesNav current="promos" isPlatformAdmin={staff.isPlatformAdmin} />
        <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
        <PromotionsTabs
          avisos={
            <PromotionsManager
              canManage={canManagePromotions}
              initialPromotions={(promotions ?? []) as Array<{
                id: string;
                title: string;
                body: string | null;
                kind: PromotionKind;
                image_url: string | null;
                discount_percent: number | null;
                product_id: string | null;
                category_id: string | null;
                starts_at: string | null;
                ends_at: string | null;
                is_active: boolean;
                created_at: string;
              }>}
              products={products ?? []}
              categories={categories ?? []}
            />
          }
          cupones={
            <CouponsManager
              canManage={canManageCoupons}
              initialCoupons={(coupons ?? []).map((row) => ({
                id: row.id,
                code: row.code,
                description: row.description,
                discount_type: row.discount_type,
                discount_value: Number(row.discount_value),
                starts_at: row.starts_at,
                ends_at: row.ends_at,
                is_active: row.is_active,
                max_uses: row.max_uses == null ? null : Number(row.max_uses),
                times_used: Number(row.times_used ?? 0),
                min_order_amount:
                  row.min_order_amount == null ? null : Number(row.min_order_amount),
                created_at: row.created_at,
              }))}
            />
          }
        />
      </Suspense>
      </div>
    </AdminShell>
  );
}
