import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv() {
  const path = resolve('apps/admin/.env.local');
  const text = readFileSync(path, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

loadEnv();

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ORG = 'a0000000-0000-4000-8000-000000000001';
const FRUTAS = 'd0000000-0000-4000-8000-000000000001';
const VERDURAS = 'd0000000-0000-4000-8000-000000000002';

async function ensureCategory(name, sortOrder) {
  const { data: existing } = await sb
    .from('product_categories')
    .select('id,name')
    .eq('organization_id', ORG)
    .eq('name', name)
    .maybeSingle();
  if (existing) return existing;
  const { data, error } = await sb
    .from('product_categories')
    .insert({ organization_id: ORG, name, sort_order: sortOrder })
    .select('id,name')
    .single();
  if (error) throw error;
  return data;
}

const chiles = await ensureCategory('Chiles', 3);
const hierbas = await ensureCategory('Hierbas', 4);
await sb.from('product_categories').update({ sort_order: 5 }).eq('id', 'd0000000-0000-4000-8000-000000000003');

const CHILES = chiles.id;
const HIERBAS = hierbas.id;

const map = {
  Blueberry: FRUTAS,
  Frambuesa: FRUTAS,
  Fresas: FRUTAS,
  Kiwi: FRUTAS,
  limón: FRUTAS,
  Limón: FRUTAS,
  'Manzana Amarilla': FRUTAS,
  'Manzana Gala': FRUTAS,
  'Manzana Roja': FRUTAS,
  Piña: FRUTAS,
  'Plátano macho': FRUTAS,
  'Plátano maduro': FRUTAS,
  'Plátano verde': FRUTAS,
  Uva: FRUTAS,
  Zarzamora: FRUTAS,
  Ajo: VERDURAS,
  Cebolla: VERDURAS,
  Chayote: VERDURAS,
  Coliflor: VERDURAS,
  Espinaca: VERDURAS,
  Jitomate: VERDURAS,
  Papa: VERDURAS,
  Pepino: VERDURAS,
  Pimientos: VERDURAS,
  Poro: VERDURAS,
  'Tomate Cherry': VERDURAS,
  'Tomate verde': VERDURAS,
  Zanahoria: VERDURAS,
  'Chile ancho': CHILES,
  'Chile de árbol': CHILES,
  'Chile guajillo': CHILES,
  'Chile habanero': CHILES,
  'Chile jalapeño': CHILES,
  'Chile morita': CHILES,
  'Chile pasilla': CHILES,
  'Chile serrano': CHILES,
  Perejil: HIERBAS,
};

const { data: products, error } = await sb.from('products').select('id,name').eq('organization_id', ORG);
if (error) throw error;

let updated = 0;
for (const p of products) {
  const categoryId = map[p.name];
  if (!categoryId) {
    console.log('NO MAP', p.name);
    continue;
  }
  const patch = { category_id: categoryId };
  if (p.name === 'limón') patch.name = 'Limón';
  const { error: uerr } = await sb.from('products').update(patch).eq('id', p.id);
  if (uerr) console.error(p.name, uerr.message);
  else updated++;
}

const { data: summary } = await sb
  .from('products')
  .select('name, category:product_categories(name)')
  .eq('organization_id', ORG)
  .order('name');
const byCat = {};
for (const row of summary) {
  const c = row.category?.name ?? 'sin';
  byCat[c] = byCat[c] || [];
  byCat[c].push(row.name);
}
console.log(JSON.stringify({ updated, byCat, chiles, hierbas }, null, 2));
