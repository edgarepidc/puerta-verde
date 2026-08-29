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

/**
 * Días de vida útil promedio (mejor calidad) según guías de almacenamiento
 * (CPMA Home Storage Guide, UC Davis / USDA extension, Epicurious dried chiles).
 * Chiles secos: vida en despensa a pico de sabor (~6 meses).
 * Frescos: refrigeración o ambiente según el producto.
 */
const SHELF_LIFE_DAYS = {
  Ajo: 60,
  Blueberry: 10,
  Cebolla: 28,
  Chayote: 10,
  'Chile ancho': 180,
  'Chile de árbol': 180,
  'Chile guajillo': 180,
  'Chile habanero': 10,
  'Chile jalapeño': 10,
  'Chile morita': 180,
  'Chile pasilla': 180,
  'Chile serrano': 10,
  Coliflor: 14,
  Espinaca: 7,
  Frambuesa: 2,
  Fresas: 2,
  Jitomate: 5,
  Kiwi: 10,
  Limón: 21,
  'Manzana Amarilla': 30,
  'Manzana Gala': 30,
  'Manzana Roja': 30,
  Papa: 21,
  Pepino: 7,
  Perejil: 7,
  Pimientos: 7,
  Piña: 3,
  'Plátano macho': 7,
  'Plátano maduro': 3,
  'Plátano verde': 5,
  Poro: 10,
  'Tomate Cherry': 5,
  'Tomate verde': 10,
  Uva: 5,
  Zanahoria: 18,
  Zarzamora: 3,
};

const { data: products, error } = await sb
  .from('products')
  .select('id,name,shelf_life_days')
  .eq('organization_id', ORG)
  .order('name');
if (error) throw error;

let updated = 0;
const missing = [];
for (const product of products) {
  const days = SHELF_LIFE_DAYS[product.name];
  if (days == null) {
    missing.push(product.name);
    continue;
  }
  const { error: uerr } = await sb
    .from('products')
    .update({ shelf_life_days: days })
    .eq('id', product.id);
  if (uerr) {
    console.error(product.name, uerr.message);
    continue;
  }
  updated++;
}

const { data: check } = await sb
  .from('products')
  .select('name, shelf_life_days, category:product_categories(name)')
  .eq('organization_id', ORG)
  .order('shelf_life_days', { ascending: true });

console.log(
  JSON.stringify(
    {
      updated,
      missing,
      products: check,
    },
    null,
    2,
  ),
);
