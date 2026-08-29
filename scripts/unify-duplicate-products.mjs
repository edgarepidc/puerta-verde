/**
 * Unifica productos duplicados (mismo nombre) en la org la Cité.
 * Conserva el de más stock/costo, reasigna FKs y suma inventario.
 *
 * Uso: node scripts/unify-duplicate-products.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv() {
  for (const line of readFileSync(resolve('apps/admin/.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

loadEnv();

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ORG = 'a0000000-0000-4000-8000-000000000001';

function nameKey(name) {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFC')
    .replace(/\s+/g, ' ');
}

/** Manual aliases: discard name → keep name */
const ALIASES = {
  'chile serran': 'chile serrano',
  esparragos: 'espárragos',
  blueberry: 'arándanos',
  blueberries: 'arándanos',
  arándano: 'arándanos',
  arandano: 'arándanos',
  arandanos: 'arándanos',
};

/** Prefer this display name when merging an alias group */
const CANONICAL_NAMES = {
  'arándanos': 'Arándanos',
  'chile serrano': 'Chile serrano',
  'espárragos': 'Espárragos',
};

function canonicalKey(name) {
  const key = nameKey(name);
  return ALIASES[key] ?? key;
}

function score(product, bp) {
  const stock = Number(bp?.stock ?? 0);
  const cost = Number(bp?.avg_unit_cost ?? 0);
  const hasImage = product.image_url ? 1 : 0;
  const active = product.is_active ? 1 : 0;
  // Prefer real inventory and cost history
  return stock * 1000 + (cost > 0 ? 100 : 0) + hasImage * 10 + active + Date.parse(product.created_at) / 1e15;
}

async function reassignBranchProduct(fromId, toId) {
  const tables = [
    'order_items',
    'purchase_items',
    'inventory_movements',
    'product_lots',
  ];
  for (const table of tables) {
    const { error, count } = await sb
      .from(table)
      .update({ branch_product_id: toId }, { count: 'exact' })
      .eq('branch_product_id', fromId);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (count) console.log(`  reassign ${table}: ${count}`);
  }
}

async function reassignProductRefs(fromProductId, toProductId) {
  // promotions.product_id
  const { error: promoErr, count: promoCount } = await sb
    .from('promotions')
    .update({ product_id: toProductId }, { count: 'exact' })
    .eq('product_id', fromProductId);
  if (promoErr) throw new Error(`promotions: ${promoErr.message}`);
  if (promoCount) console.log(`  reassign promotions: ${promoCount}`);
}

const { data: products, error } = await sb
  .from('products')
  .select('id,name,unit,sku,image_url,is_active,category_id,created_at')
  .eq('organization_id', ORG);
if (error) throw error;

const { data: branchProducts, error: bpErr } = await sb
  .from('branch_products')
  .select('id,product_id,branch_id,price,stock,avg_unit_cost,last_unit_cost,min_stock,is_available');
if (bpErr) throw bpErr;

const bpByProduct = new Map();
for (const bp of branchProducts ?? []) {
  if (!bpByProduct.has(bp.product_id)) bpByProduct.set(bp.product_id, []);
  bpByProduct.get(bp.product_id).push(bp);
}

const groups = new Map();
for (const p of products) {
  const key = canonicalKey(p.name);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(p);
}

// Rename Esparragos → Espárragos if alone under alias target
for (const p of products) {
  if (nameKey(p.name) === 'esparragos') {
    const { error: renameErr } = await sb.from('products').update({ name: 'Espárragos' }).eq('id', p.id);
    if (renameErr) console.error('rename Esparragos', renameErr.message);
    else {
      p.name = 'Espárragos';
      console.log('RENAME Esparragos → Espárragos');
    }
  }
  if (nameKey(p.name) === 'chile serran') {
    // will merge into chile serrano below; rename first so group key matches
  }
}

const results = [];

for (const [key, rows] of groups) {
  if (rows.length < 2) continue;

  const enriched = rows.map((p) => {
    const bps = bpByProduct.get(p.id) ?? [];
    const bp = bps[0] ?? null;
    const canonical = CANONICAL_NAMES[key];
    const nameBonus = canonical && nameKey(p.name) === nameKey(canonical) ? 1_000_000 : 0;
    return { product: p, bp, bps, score: score(p, bp) + nameBonus };
  });
  enriched.sort((a, b) => b.score - a.score);

  const keep = enriched[0];
  const discards = enriched.slice(1);

  console.log('\nMERGE', key, '→ keep', keep.product.id.slice(0, 8), keep.product.name);

  const canonicalName = CANONICAL_NAMES[key];
  if (canonicalName && keep.product.name !== canonicalName) {
    const { error: renameKeepErr } = await sb
      .from('products')
      .update({ name: canonicalName })
      .eq('id', keep.product.id);
    if (renameKeepErr) throw new Error(`rename keep: ${renameKeepErr.message}`);
    keep.product.name = canonicalName;
    console.log('  rename keep →', canonicalName);
  }

  for (const discard of discards) {
    console.log('  discard', discard.product.id.slice(0, 8), discard.product.name);

    if (keep.bp && discard.bp) {
      if (keep.bp.branch_id !== discard.bp.branch_id) {
        throw new Error(`Different branches for ${key}`);
      }
      await reassignBranchProduct(discard.bp.id, keep.bp.id);

      const stockKeep = Number(keep.bp.stock ?? 0);
      const stockDisc = Number(discard.bp.stock ?? 0);
      const costKeep = Number(keep.bp.avg_unit_cost ?? 0);
      const costDisc = Number(discard.bp.avg_unit_cost ?? 0);
      const totalStock = stockKeep + stockDisc;
      const avgCost =
        totalStock > 0
          ? (stockKeep * costKeep + stockDisc * costDisc) / totalStock
          : Math.max(costKeep, costDisc);
      const lastCost =
        Number(discard.bp.last_unit_cost ?? 0) > 0
          ? Number(discard.bp.last_unit_cost)
          : Number(keep.bp.last_unit_cost ?? 0);
      const price = Math.max(Number(keep.bp.price ?? 0), Number(discard.bp.price ?? 0));
      const minStock = Math.max(Number(keep.bp.min_stock ?? 0), Number(discard.bp.min_stock ?? 0));

      const { error: updErr } = await sb
        .from('branch_products')
        .update({
          stock: totalStock,
          avg_unit_cost: Math.round(avgCost * 100) / 100,
          last_unit_cost: lastCost || null,
          price,
          min_stock: minStock,
          is_available: true,
        })
        .eq('id', keep.bp.id);
      if (updErr) throw updErr;

      keep.bp.stock = totalStock;
      keep.bp.avg_unit_cost = avgCost;

      const { error: delBpErr } = await sb.from('branch_products').delete().eq('id', discard.bp.id);
      if (delBpErr) throw new Error(`delete bp: ${delBpErr.message}`);
    } else if (discard.bp && !keep.bp) {
      // Move branch product to keeper product
      const { error: moveErr } = await sb
        .from('branch_products')
        .update({ product_id: keep.product.id })
        .eq('id', discard.bp.id);
      if (moveErr) throw moveErr;
      keep.bp = { ...discard.bp, product_id: keep.product.id };
    }

    await reassignProductRefs(discard.product.id, keep.product.id);

    // Prefer keeper image if empty
    if (!keep.product.image_url && discard.product.image_url) {
      await sb.from('products').update({ image_url: discard.product.image_url }).eq('id', keep.product.id);
      keep.product.image_url = discard.product.image_url;
    }
    if (!keep.product.category_id && discard.product.category_id) {
      await sb.from('products').update({ category_id: discard.product.category_id }).eq('id', keep.product.id);
    }

    const { error: delProdErr } = await sb.from('products').delete().eq('id', discard.product.id);
    if (delProdErr) throw new Error(`delete product: ${delProdErr.message}`);

    results.push({
      key,
      kept: keep.product.id,
      deleted: discard.product.id,
      mergedStock: keep.bp?.stock ?? null,
    });
  }
}

const { data: final } = await sb
  .from('products')
  .select('id,name')
  .eq('organization_id', ORG)
  .order('name');

const byName = new Map();
for (const p of final) {
  const k = nameKey(p.name);
  byName.set(k, (byName.get(k) || 0) + 1);
}
const remainingDups = [...byName.entries()].filter(([, n]) => n > 1);

console.log(
  JSON.stringify(
    {
      merged: results.length,
      results,
      remainingDups,
      totalProducts: final.length,
    },
    null,
    2,
  ),
);
