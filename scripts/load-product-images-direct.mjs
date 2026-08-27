import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Direct Wikimedia Commons file names (Special:FilePath). */
const FILES = {
  Cebolla: 'Onion_white_background2.jpg',
  Chayote: 'Chayote_squash.jpg',
  'Chile jalapeño': 'Jalapeno.jpg',
  'Chile morita': 'Chipotle.jpg',
  'Chile pasilla': 'Pasilla.jpg',
  'Chile serrano': 'SerranoPepper.jpg',
  Coliflor: 'Cauliflower_Flickr_exfordy.jpg',
  Espinaca: 'Spinach_leaves.jpg',
  Frambuesa: 'Raspberry.jpg',
  Fresas: 'Strawberry_09_(8227148264).jpg',
  Jitomate: 'Tomato_-_whole_and_half.jpg',
  Kiwi: 'Kiwi_(Actinidia_chinensis)_1_Luc_Viatour.jpg',
  Limón: 'Lemon.jpg',
  'Manzana Amarilla': 'Golden_delicious_apple.jpg',
  'Manzana Gala': 'Gala_apple.jpg',
  'Manzana Roja': 'Red_Apple.jpg',
  Papa: 'Patates.jpg',
  Pepino: 'Cucumber.jpg',
  Perejil: 'Parsley.jpg',
  Pimientos: 'Bell_peppers.jpg',
  Piña: 'Pineapple_and_cross_section.jpg',
  'Plátano macho': 'Plantains.jpg',
  'Plátano maduro': 'Bananas.jpg',
  'Plátano verde': 'Green_bananas.jpg',
  Poro: 'Leek.jpg',
  'Tomate Cherry': 'Cherry_tomatoes.jpg',
  'Tomate verde': 'Tomatillo.jpg',
  Uva: 'Grapes.jpg',
  Zanahoria: 'Carrots.jpg',
  Zarzamora: 'Blackberry.jpg',
};

async function downloadViaSpecialPath(fileName) {
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=800`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PuertaVerdeCatalogBot/1.0 (la Cite product catalog; contact via admin)' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${fileName}`);
  const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
  if (!contentType.startsWith('image/')) throw new Error(`Not an image: ${contentType}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 1000) throw new Error('File too small');
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

const missing = products.filter((p) => !p.image_url);
console.log('Missing', missing.length);

const results = [];
for (const product of missing) {
  const fileName = FILES[product.name];
  if (!fileName) {
    results.push({ name: product.name, status: 'no-file' });
    continue;
  }
  try {
    await sleep(1500);
    const { buffer, contentType } = await downloadViaSpecialPath(fileName);
    const ext = extFor(contentType);
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
      .eq('id', product.id);
    if (dbErr) throw dbErr;
    results.push({ name: product.name, status: 'ok' });
    console.log('OK', product.name);
  } catch (err) {
    results.push({ name: product.name, status: 'error', error: err.message });
    console.error('FAIL', product.name, err.message);
  }
}

console.log(
  JSON.stringify(
    {
      ok: results.filter((r) => r.status === 'ok').length,
      fail: results.filter((r) => r.status !== 'ok'),
    },
    null,
    2,
  ),
);
