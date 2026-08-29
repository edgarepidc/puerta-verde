import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

function loadEnv() {
  for (const line of readFileSync(resolve('apps/admin/.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

loadEnv();

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ORG = 'a0000000-0000-4000-8000-000000000001';
const assetsDir =
  '/Users/epgimeniodiaz/.cursor/projects/Users-epgimeniodiaz-Library-CloudStorage-OneDrive-Personal-Documentos-03-Entrepreneur-puerta-verde/assets';

const FILES = {
  Chayote: 'chayote.png',
  'Chile jalapeño': 'chile-jalapeno.png',
  'Chile serrano': 'chile-serrano.png',
  Coliflor: 'coliflor.png',
  Fresas: 'fresas.png',
  Jitomate: 'jitomate.png',
  Limón: 'limon.png',
  'Manzana Amarilla': 'manzana-amarilla.png',
  'Manzana Gala': 'manzana-gala.png',
  Perejil: 'perejil.png',
  Pimientos: 'pimientos.png',
  'Plátano macho': 'platano-macho.png',
  'Plátano verde': 'platano-verde.png',
  Poro: 'poro.png',
  'Tomate Cherry': 'tomate-cherry.png',
  'Tomate verde': 'tomate-verde.png',
  Uva: 'uva.png',
  Zanahoria: 'zanahoria.png',
  Zarzamora: 'zarzamora.png',
};

const { data: products, error } = await sb
  .from('products')
  .select('id,name,image_url')
  .eq('organization_id', ORG);
if (error) throw error;

const byName = new Map(products.map((p) => [p.name, p]));
const results = [];

for (const [name, file] of Object.entries(FILES)) {
  const product = byName.get(name);
  if (!product) {
    results.push({ name, status: 'missing-product' });
    continue;
  }
  const local = resolve(assetsDir, file);
  if (!existsSync(local)) {
    results.push({ name, status: 'missing-file', file });
    continue;
  }
  try {
    const buffer = readFileSync(local);
    const path = `${ORG}/${Date.now()}-${randomUUID().slice(0, 8)}.png`;
    const { error: upErr } = await sb.storage.from('product-media').upload(path, buffer, {
      contentType: 'image/png',
      upsert: false,
    });
    if (upErr) throw upErr;
    const { data: pub } = sb.storage.from('product-media').getPublicUrl(path);
    const { error: dbErr } = await sb
      .from('products')
      .update({ image_url: pub.publicUrl })
      .eq('id', product.id);
    if (dbErr) throw dbErr;
    results.push({ name, status: 'ok' });
    console.log('OK', name);
  } catch (err) {
    results.push({ name, status: 'error', error: err.message });
    console.error('FAIL', name, err.message);
  }
}

const { data: check } = await sb
  .from('products')
  .select('name, image_url, category:product_categories(name)')
  .eq('organization_id', ORG)
  .order('name');
const without = check.filter((p) => !p.image_url).map((p) => p.name);
const byCat = {};
for (const row of check) {
  const c = row.category?.name ?? 'sin';
  byCat[c] = (byCat[c] || 0) + 1;
}
console.log(JSON.stringify({ uploaded: results.filter((r) => r.status === 'ok').length, without, byCat }, null, 2));
