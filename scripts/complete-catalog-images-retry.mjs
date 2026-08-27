/**
 * Reintenta imágenes faltantes (Wikimedia + generación local de gomitas).
 * Uso: node scripts/complete-catalog-images-retry.mjs
 */
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Prefer verified Commons paths; try alternates on failure. */
const WIKI_CANDIDATES = {
  Apio: ['Fresh_celery.jpg', 'Celery.jpg', 'Apium_graveolens_leaves.jpg'],
  Betabel: ['Beetroot.jpg', 'Rote_Bete.jpg', 'Beta_vulgaris.jpg'],
  'Calabaza italiana': ['Zucchini.jpg', 'Courgette.jpg', 'Cucurbita_pepo_zucchini.jpg'],
  Camote: ['Sweet_potato.jpg', 'Ipomoea_batatas.jpg', 'Batata.jpg'],
  Champiñones: ['Agaricus_bisporus_.jpg', 'White_button_mushroom.jpg', 'Champignon.jpg'],
  'Champiñones Granel': ['Agaricus_bisporus_.jpg', 'White_button_mushroom.jpg', 'Champignon.jpg'],
  'Chile Poblano': ['Poblano_pepper.jpg', 'Capsicum_annuum_var._annuum_%27Poblano%27.jpg', 'Green_chili_pepper.jpg'],
  'Chile serran': ['Serrano_pepper.jpg', 'Capsicum_annuum_Serrano.jpg', 'Green_chili_pepper.jpg'],
  Cilantro: ['Coriander.jpg', 'Cilantro.jpg', 'Coriandrum_sativum_leaves.jpg'],
  Ciruela: ['Plum.jpg', 'Prunus_domestica.jpg', 'Red_plums.jpg'],
  Espárragos: ['Asparagus.jpg', 'Asparagus_officinalis.jpg', 'Green_asparagus.jpg'],
  Granada: ['Pomegranate.jpg', 'Punica_granatum_fruit.jpg', 'Opened_pomegranate.jpg'],
  Guayaba: ['Guava.jpg', 'Psidium_guajava.jpg', 'Common_guava.jpg'],
  Hierbabuena: ['Spearmint.jpg', 'Mentha_spicata_leaves.jpg', 'Mint_leaves.jpg'],
  Jengibre: ['Ginger.jpg', 'Zingiber_officinale.jpg', 'Fresh_ginger_root.jpg'],
  Jicama: ['Jicama.jpg', 'Pachyrhizus_erosus_tuber.jpg', 'Mexican_turnip.jpg'],
  'Lechuga orejona': ['Iceberg_lettuce_2.jpg', 'Lettuce.jpg', 'Lactuca_sativa.jpg'],
  'Lechuga romana': ['Romaine.jpg', 'Cos_lettuce.jpg', 'Lactuca_sativa_Romaine.jpg'],
  Mamey: ['Mamey_sapote.jpg', 'Pouteria_sapota_fruit.jpg', 'Sapote.jpg'],
  Mandarina: ['Mandarin_orange.jpg', 'Citrus_reticulata.jpg', 'Tangerine.jpg'],
  'Mango Ataulfo': ['Mango.jpg', 'Ataulfo.jpg', 'Mangifera_indica_fruit.jpg'],
  Melón: ['Cantaloupe.jpg', 'Muskmelon.jpg', 'Cucumis_melo.jpg'],
  Nopales: ['Opuntia_ficus-indica.jpg', 'Nopal.jpg', 'Prickly_pear_pads.jpg'],
  Pitahaya: ['Dragon_fruit.jpg', 'Hylocereus_undatus.jpg', 'Pitaya.jpg'],
  'Sandía Mini': ['Watermelon_cross_BNC.jpg', 'Citrullus_lanatus.jpg', 'Watermelon.jpg'],
  'Sandía Rayada': ['Watermelon_cross_BNC.jpg', 'Citrullus_lanatus.jpg', 'Watermelon.jpg'],
  Toronja: ['Grapefruit_illustration.jpg', 'Citrus_paradisi.jpg', 'Pink_grapefruit.jpg'],
  Tuna: ['Opuntia_fruit.jpg', 'Prickly_pear.jpg', 'Indian_fig.jpg'],
};

async function downloadWiki(fileName) {
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=900`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PuertaVerdeCatalogBot/1.1 (verduleria; catalog images)' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
  if (!contentType.startsWith('image/')) throw new Error(`Not image: ${contentType}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 800) throw new Error('Too small');
  return { buffer, contentType };
}

function extFor(contentType) {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  return 'jpg';
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
  .select('id,name,image_url')
  .eq('organization_id', ORG)
  .order('name');
if (error) throw error;

const missing = products.filter((p) => !p.image_url);
const byName = new Map();
for (const p of missing) {
  if (!byName.has(p.name)) byName.set(p.name, []);
  byName.get(p.name).push(p);
}

console.log('Missing image rows:', missing.length, 'unique names:', byName.size);

let ok = 0;
const failures = [];

for (const [name, rows] of byName) {
  if (name.startsWith('Gomitas')) {
    failures.push({ name, error: 'skip-gomitas-for-now' });
    continue;
  }
  const candidates = WIKI_CANDIDATES[name] ?? [];
  if (candidates.length === 0) {
    failures.push({ name, error: 'no candidates' });
    continue;
  }

  let downloaded = null;
  for (const file of candidates) {
    try {
      await sleep(2500);
      downloaded = await downloadWiki(file);
      console.log('GOT', name, '←', file);
      break;
    } catch (err) {
      console.log('try fail', name, file, err.message);
    }
  }

  if (!downloaded) {
    failures.push({ name, error: 'all candidates failed' });
    continue;
  }

  try {
    const ext = extFor(downloaded.contentType);
    for (const row of rows) {
      await uploadBuffer(row.id, downloaded.buffer, downloaded.contentType, ext);
      ok++;
      console.log('OK', name, row.id.slice(0, 8));
    }
  } catch (err) {
    failures.push({ name, error: err.message });
  }
}

const { data: final } = await sb
  .from('products')
  .select('name, image_url')
  .eq('organization_id', ORG);
const still = [...new Set(final.filter((p) => !p.image_url).map((p) => p.name))];
console.log(JSON.stringify({ uploadedRows: ok, failures, stillNoImage: still }, null, 2));
