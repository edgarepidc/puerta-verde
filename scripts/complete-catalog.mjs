/**
 * Completa categorías e imágenes faltantes en el catálogo de la Cité.
 * Uso: node scripts/complete-catalog.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, basename, extname } from 'node:path';
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const frutas = await ensureCategory('Frutas', 1);
const verduras = await ensureCategory('Verduras', 2);
const chiles = await ensureCategory('Chiles', 3);
const hierbas = await ensureCategory('Hierbas', 4);
const semillas = await ensureCategory('Semillas y granos', 5);
const hongos = await ensureCategory('Hongos', 6);
const dulces = await ensureCategory('Dulces', 7);

const CATEGORY_BY_NAME = {
  // Frutas
  Acitrón: frutas.id,
  Blueberry: frutas.id,
  Ciruela: frutas.id,
  Granada: frutas.id,
  Guayaba: frutas.id,
  Mamey: frutas.id,
  Mandarina: frutas.id,
  'Mango Ataulfo': frutas.id,
  Melón: frutas.id,
  Naranja: frutas.id,
  Pitahaya: frutas.id,
  'Plátano dominico': frutas.id,
  'Sandía Mini': frutas.id,
  'Sandía Rayada': frutas.id,
  Toronja: frutas.id,
  Tuna: frutas.id,
  // Verduras
  Apio: verduras.id,
  Arugula: verduras.id,
  Betabel: verduras.id,
  Brócoli: verduras.id,
  'Calabaza italiana': verduras.id,
  Camote: verduras.id,
  'Cebolla morada': verduras.id,
  Esparragos: verduras.id,
  Espárragos: verduras.id,
  Jengibre: verduras.id,
  Jicama: verduras.id,
  'Lechuga orejona': verduras.id,
  'Lechuga romana': verduras.id,
  Nopales: verduras.id,
  // Chiles
  'Chile Poblano': chiles.id,
  'Chile serran': chiles.id,
  'Chile serrano': chiles.id,
  // Hierbas
  Cilantro: hierbas.id,
  Hierbabuena: hierbas.id,
  // Hongos
  Champiñones: hongos.id,
  'Champiñones Granel': hongos.id,
  // Dulces
  'Gomitas de aro': dulces.id,
  'Gomitas de estrella': dulces.id,
  'Gomitas Mango': dulces.id,
};

/** Local files already downloaded into .tmp/product-images */
const LOCAL_TMP = {
  Ajo: 'Ajo.jpg',
  Blueberry: 'Blueberry.jpg',
  'Chile ancho': 'Chile-ancho.jpg',
  'Chile de árbol': 'Chile-de-árbol.jpg',
  'Chile guajillo': 'Chile-guajillo.jpg',
  'Chile habanero': 'Chile-habanero.jpg',
};

/** Generated / curated assets in Cursor project assets folder */
const ASSETS_DIR =
  '/Users/epgimeniodiaz/.cursor/projects/Users-epgimeniodiaz-Library-CloudStorage-OneDrive-Personal-Documentos-03-Entrepreneur-puerta-verde/assets';
const LOCAL_ASSETS = {
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

/** Wikimedia Commons Special:FilePath names for products still missing images */
const WIKI_FILES = {
  Acitrón: 'Candied_fruit.jpg',
  Apio: 'Celery_stalk.jpg',
  Arugula: 'Eruca_sativa.jpg',
  Betabel: 'Beets-Bundle.jpg',
  Brócoli: 'Broccoli_and_cross_section_edit.jpg',
  'Calabaza italiana': 'Zucchini-Whole.jpg',
  Camote: 'SweetPotato.jpg',
  'Cebolla morada': 'Red_onion.jpg',
  Champiñones: 'Champignon_mushroom.jpg',
  'Champiñones Granel': 'Champignon_mushroom.jpg',
  'Chile Poblano': 'Poblano.jpg',
  'Chile serran': 'SerranoPepper.jpg',
  'Chile serrano': 'SerranoPepper.jpg',
  Cilantro: 'Coriander_leaves.jpg',
  Ciruela: 'Plums.jpg',
  Esparragos: 'Asparagus-Bundle.jpg',
  Espárragos: 'Asparagus-Bundle.jpg',
  Granada: 'Pomegranate_fruit.jpg',
  Guayaba: 'Psidium_guajava_fruit.jpg',
  Hierbabuena: 'Mentha_spicata.jpg',
  Jengibre: 'Ginger_root.jpg',
  Jicama: 'Pachyrhizus_erosus.jpg',
  'Lechuga orejona': 'Iceberg_lettuce.jpg',
  'Lechuga romana': 'Romaine_lettuce.jpg',
  Mamey: 'Pouteria_sapota.jpg',
  Mandarina: 'TangerineFruit.jpg',
  'Mango Ataulfo': 'Ataulfo_mango.jpg',
  Melón: 'Cantaloupe_and_cross_section.jpg',
  Naranja: 'OrangeBloss_wb.jpg',
  Nopales: 'Nopales.jpg',
  Pitahaya: 'Pitaya_cross_section_ed2.jpg',
  'Plátano dominico': 'Bananas.jpg',
  'Sandía Mini': 'Watermelon.jpg',
  'Sandía Rayada': 'Watermelon.jpg',
  Toronja: 'Grapefruit.jpg',
  Tuna: 'Opuntia_ficus-indica_fruit.jpg',
  Blueberry: 'Blueberries.jpg',
};

async function downloadWiki(fileName) {
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=900`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'PuertaVerdeCatalogBot/1.0 (la Cite verduleria catalog fill)',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
  if (!contentType.startsWith('image/')) throw new Error(`Not image: ${contentType}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 800) throw new Error('Too small');
  return { buffer, contentType };
}

function extFor(contentType, fallback = 'jpg') {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  return fallback;
}

async function uploadBuffer(productId, buffer, contentType, ext) {
  const path = `${ORG}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
  const { error: upErr } = await sb.storage.from('product-media').upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (upErr) throw upErr;
  const { data: pub } = sb.storage.from('product-media').getPublicUrl(path);
  const { error: dbErr } = await sb
    .from('products')
    .update({ image_url: pub.publicUrl })
    .eq('id', productId);
  if (dbErr) throw dbErr;
  return pub.publicUrl;
}

const { data: products, error } = await sb
  .from('products')
  .select('id,name,image_url,category_id')
  .eq('organization_id', ORG)
  .order('name');
if (error) throw error;

let categoriesUpdated = 0;
for (const p of products) {
  const catId = CATEGORY_BY_NAME[p.name];
  if (!catId) continue;
  // Fix missing category OR wrong fruit-tagged broccoli / mint-as-veg
  const shouldSet =
    !p.category_id ||
    (p.name === 'Brócoli' && p.category_id === frutas.id) ||
    (p.name === 'Hierbabuena' && p.category_id === verduras.id);
  if (!shouldSet) continue;
  if (p.category_id === catId) continue;
  const { error: uerr } = await sb.from('products').update({ category_id: catId }).eq('id', p.id);
  if (uerr) console.error('CAT FAIL', p.name, uerr.message);
  else {
    categoriesUpdated++;
    console.log('CAT', p.name, '→', Object.entries({ frutas, verduras, chiles, hierbas, hongos, dulces }).find(([, c]) => c.id === catId)?.[0] ?? catId);
  }
}

const byName = new Map();
for (const p of products) {
  if (!byName.has(p.name)) byName.set(p.name, []);
  byName.get(p.name).push(p);
}

let imagesUploaded = 0;
const imageFailures = [];

async function setImageForName(name, buffer, contentType, ext) {
  const rows = byName.get(name) ?? [];
  const targets = rows.filter((r) => !r.image_url);
  if (targets.length === 0) return 0;
  let n = 0;
  for (const row of targets) {
    await uploadBuffer(row.id, buffer, contentType, ext);
    row.image_url = 'set';
    n++;
    imagesUploaded++;
    console.log('IMG', name, row.id.slice(0, 8));
  }
  return n;
}

// 1) Local tmp
for (const [name, file] of Object.entries(LOCAL_TMP)) {
  const local = resolve('.tmp/product-images', file);
  if (!existsSync(local)) continue;
  try {
    const buffer = readFileSync(local);
    const ext = extname(file).replace('.', '') || 'jpg';
    const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
    await setImageForName(name, buffer, contentType, ext);
  } catch (err) {
    imageFailures.push({ name, source: 'tmp', error: err.message });
  }
}

// 2) Local assets (only if still missing)
for (const [name, file] of Object.entries(LOCAL_ASSETS)) {
  const rows = (byName.get(name) ?? []).filter((r) => !r.image_url);
  if (rows.length === 0) continue;
  const local = resolve(ASSETS_DIR, file);
  if (!existsSync(local)) continue;
  try {
    const buffer = readFileSync(local);
    const ext = extname(file).replace('.', '') || 'png';
    const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
    await setImageForName(name, buffer, contentType, ext);
  } catch (err) {
    imageFailures.push({ name, source: 'assets', error: err.message });
  }
}

// 3) Wikimedia for remaining
const stillMissing = [...byName.entries()]
  .filter(([, rows]) => rows.some((r) => !r.image_url))
  .map(([name]) => name);

for (const name of stillMissing) {
  const wiki = WIKI_FILES[name];
  if (!wiki) {
    imageFailures.push({ name, source: 'wiki', error: 'no mapping' });
    continue;
  }
  try {
    await sleep(400);
    const { buffer, contentType } = await downloadWiki(wiki);
    await setImageForName(name, buffer, contentType, extFor(contentType));
  } catch (err) {
    imageFailures.push({ name, source: 'wiki', error: err.message, file: wiki });
    console.error('WIKI FAIL', name, err.message);
  }
}

const { data: final } = await sb
  .from('products')
  .select('name, image_url, category:product_categories(name)')
  .eq('organization_id', ORG)
  .order('name');

const stillNoImage = final.filter((p) => !p.image_url).map((p) => p.name);
const stillNoCat = final.filter((p) => !p.category?.name).map((p) => p.name);
const byCat = {};
for (const row of final) {
  const c = row.category?.name ?? 'sin';
  byCat[c] = (byCat[c] || 0) + 1;
}

console.log(
  JSON.stringify(
    {
      categoriesUpdated,
      imagesUploaded,
      imageFailures,
      stillNoImage: [...new Set(stillNoImage)],
      stillNoCat: [...new Set(stillNoCat)],
      byCat,
      total: final.length,
    },
    null,
    2,
  ),
);
