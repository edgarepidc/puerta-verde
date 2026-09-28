import { perBagFromTotal } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';
import type { Database } from '@puertaverde/supabase';

type ClearancePackTemplateRow = Database['public']['Tables']['clearance_pack_templates']['Row'];
type ClearancePackTemplateItemRow =
  Database['public']['Tables']['clearance_pack_template_items']['Row'];

export interface SavedClearancePackTemplate {
  id: string;
  title: string;
  defaultPrice: number;
  defaultBagCount: number;
  items: Array<{
    productId: string;
    piecesPerBag: number | null;
    quantityPerBag: number | null;
  }>;
}

type TemplateListRow = Pick<
  ClearancePackTemplateRow,
  'id' | 'title' | 'default_price' | 'default_bag_count'
> & {
  items: Array<
    Pick<
      ClearancePackTemplateItemRow,
      'product_id' | 'sort_order' | 'pieces_per_bag' | 'quantity_per_bag'
    >
  > | null;
};

export function mapClearancePackTemplate(row: TemplateListRow): SavedClearancePackTemplate {
  const items = [...(row.items ?? [])].sort(
    (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0),
  );
  return {
    id: row.id,
    title: row.title,
    defaultPrice: Number(row.default_price),
    defaultBagCount: Number(row.default_bag_count),
    items: items.map((item) => ({
      productId: item.product_id,
      piecesPerBag: item.pieces_per_bag != null ? Number(item.pieces_per_bag) : null,
      quantityPerBag: item.quantity_per_bag != null ? Number(item.quantity_per_bag) : null,
    })),
  };
}

export async function listClearancePackTemplates(
  supabase: ReturnType<typeof createAdminClient>,
  branchId: string,
) {
  const { data, error } = await supabase
    .from('clearance_pack_templates')
    .select(
      `
      id,
      title,
      default_price,
      default_bag_count,
      last_used_at,
      updated_at,
      items:clearance_pack_template_items (
        product_id,
        sort_order,
        pieces_per_bag,
        quantity_per_bag
      )
    `,
    )
    .eq('branch_id', branchId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return [...(data ?? [])]
    .sort((left, right) => {
      const leftUsed = left.last_used_at ? Date.parse(left.last_used_at) : 0;
      const rightUsed = right.last_used_at ? Date.parse(right.last_used_at) : 0;
      if (rightUsed !== leftUsed) return rightUsed - leftUsed;
      return Date.parse(right.updated_at) - Date.parse(left.updated_at);
    })
    .map((row) => mapClearancePackTemplate(row as TemplateListRow));
}

export async function upsertClearancePackTemplate(
  supabase: ReturnType<typeof createAdminClient>,
  input: {
    branchId: string;
    templateId?: string | null;
    title: string;
    price: number;
    bagCount: number;
    items: Array<{
      productId: string;
      weigh: boolean;
      quantity: number;
      pieces?: number | null;
    }>;
  },
) {
  const title = input.title.trim();
  const bags = Math.max(1, Math.round(Number(input.bagCount) || 0));
  let templateId = input.templateId?.trim() || null;

  if (templateId) {
    const { data: existing } = await supabase
      .from('clearance_pack_templates')
      .select('id')
      .eq('id', templateId)
      .eq('branch_id', input.branchId)
      .maybeSingle();
    if (!existing) templateId = null;
  }

  if (!templateId) {
    const { data: rows } = await supabase
      .from('clearance_pack_templates')
      .select('id, title')
      .eq('branch_id', input.branchId);
    const match = (rows ?? []).find(
      (row) => row.title.trim().toLowerCase() === title.toLowerCase(),
    );
    templateId = match?.id ?? null;
  }

  const now = new Date().toISOString();
  if (templateId) {
    const { error } = await supabase
      .from('clearance_pack_templates')
      .update({
        title,
        default_price: input.price,
        default_bag_count: bags,
        last_used_at: now,
        updated_at: now,
      })
      .eq('id', templateId)
      .eq('branch_id', input.branchId);
    if (error) throw new Error(error.message);

    const { error: deleteError } = await supabase
      .from('clearance_pack_template_items')
      .delete()
      .eq('template_id', templateId);
    if (deleteError) throw new Error(deleteError.message);
  } else {
    const { data, error } = await supabase
      .from('clearance_pack_templates')
      .insert({
        branch_id: input.branchId,
        title,
        default_price: input.price,
        default_bag_count: bags,
        last_used_at: now,
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'No se pudo guardar el paquete');
    templateId = data.id;
  }

  const rows = input.items.map((item, index) => ({
    template_id: templateId as string,
    product_id: item.productId,
    sort_order: index,
    pieces_per_bag:
      item.weigh && Number(item.pieces) > 0 ? perBagFromTotal(Number(item.pieces), bags) : null,
    quantity_per_bag: item.weigh ? null : perBagFromTotal(item.quantity, bags),
  }));

  if (rows.length) {
    const { error } = await supabase.from('clearance_pack_template_items').insert(rows);
    if (error) throw new Error(error.message);
  }

  return templateId as string;
}
