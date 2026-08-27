import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

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
const tmpDir = resolve('.tmp/product-images');
mkdirSync(tmpDir, { recursive: true });

/** Search queries tuned for recognizable produce photos on Wikimedia Commons */
const SEARCH = {
  Ajo: 'Garlic bulbs',
  Blueberry: 'Blueberries fruit',
  Cebolla: 'Onion white bulbs',
  Chayote: 'Chayote fruit',
  'Chile ancho': 'Ancho chile dried',
  'Chile de árbol': 'Chile de arbol',
  'Chile guajillo': 'Guajillo chile',
  'Chile habanero': 'Habanero pepper',
  'Chile jalapeño': 'Jalapeno peppers',
  'Chile morita': 'Chipotle morita chile',
  'Chile pasilla': 'Pasilla chile',
  'Chile serrano': 'Serrano pepper',
  Coliflor: 'Cauliflower',
  Espinaca: 'Spinach leaves',
  Frambuesa: 'Raspberries',
  Fresas: 'Strawberries',
  Jitomate: 'Roma tomatoes',
  Kiwi: 'Kiwi fruit cut',
  Limón: 'Lemon fruit',
  'Manzana Amarilla': 'Golden delicious apple',
  'Manzana Gala': 'Gala apple',
  'Manzana Roja': 'Red apple',
  Papa: 'Potatoes',
  Pepino: 'Cucumber',
  Perejil: 'Parsley bunch',
  Pimientos: 'Bell peppers',
  Piña: 'Pineapple fruit',
  'Plátano macho': 'Plantain bananas',
  'Plátano maduro': 'Ripe bananas',
  'Plátano verde': 'Green bananas',
  Poro: 'Leek vegetable',
  'Tomate Cherry': 'Cherry tomatoes',
  'Tomate verde': 'Tomatillo',
  Uva: 'Grapes bunch',
  Zanahoria: 'Carrots',
  Zarzamora: 'Blackberries',
};

async function findCommonsImage(query) {
  const api = new URL('https://commons.wikimedia.org/w/api.php');
  api.searchParams.set('action', 'query');
  api.searchParams.set('generator', 'search');
  api.searchParams.set('gsrsearch', `filetype:bitmap ${query}`);
  api.searchParams.set('gsrnamespace', '6');
  api.searchParams.set('gsrlimit', '8');
  api.searchParams.set('prop', 'imageinfo');
  api.searchParams.set('iiprop', 'url|mime|size');
  api.searchParams.set('iiurlwidth', '800');
  api.searchParams.set('format', 'json');
  api.searchParams.set('origin', '*');

  const res = await fetch(api, {
    headers: { 'User-Agent': 'PuertaVerdeCatalogBot/1.0 (product catalog enrichment)' },
  });
  if (!res.ok) throw new Error(`Commons search failed: ${res.status}`);
  const json = await res.json();
  const pages = Object.values(json.query?.pages ?? {});
  const candidates = pages
    .map((p) => p.imageinfo?.[0])
    .filter(Boolean)
    .filter((info) => ['image/jpeg', 'image/png', 'image/webp'].includes(info.mime))
    .filter((info) => (info.size ?? 0) < 4_500_000)
    .filter((info) => info.thumburl || info.url);

  return candidates[0] ?? null;
}

async function download(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PuertaVerdeCatalogBot/1.0 (product catalog enrichment)' },
  });
  if (!res.ok) throw new Error(`Download failed ${res.status} ${url}`);
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType };
}

function extFor(contentType) {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  return 'jpg';
}

const { data: products, error } = await sb
  .from('products')
  .select('id,name,image_url')
  .eq('organization_id', ORG)
  .order('name');
if (error) throw error;

const results = [];
for (const product of products) {
  const query = SEARCH[product.name];
  if (!query) {
    results.push({ name: product.name, status: 'no-query' });
    continue;
  }
  try {
    const info = await findCommonsImage(query);
    if (!info) {
      results.push({ name: product.name, status: 'not-found', query });
      continue;
    }
    const sourceUrl = info.thumburl || info.url;
    const { buffer, contentType } = await download(sourceUrl);
    const ext = extFor(contentType);
    const path = `${ORG}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
    const local = resolve(tmpDir, `${product.name.replace(/\s+/g, '-')}.${ext}`);
    writeFileSync(local, buffer);

    const { error: upErr } = await sb.storage.from('product-media').upload(path, buffer, {
      contentType: contentType.startsWith('image/') ? contentType.split(';')[0] : 'image/jpeg',
      upsert: false,
    });
    if (upErr) throw upErr;

    const { data: pub } = sb.storage.from('product-media').getPublicUrl(path);
    const { error: dbErr } = await sb
      .from('products')
      .update({ image_url: pub.publicUrl })
      .eq('id', product.id);
    if (dbErr) throw dbErr;

    results.push({ name: product.name, status: 'ok', url: pub.publicUrl });
    console.log('OK', product.name);
  } catch (err) {
    results.push({ name: product.name, status: 'error', error: err.message });
    console.error('FAIL', product.name, err.message);
  }
  // be polite to Wikimedia
  await new Promise((r) => setTimeout(r, 400));
}

const ok = results.filter((r) => r.status === 'ok').length;
const fail = results.filter((r) => r.status !== 'ok');
console.log(JSON.stringify({ ok, failCount: fail.length, fail, results }, null, 2));
