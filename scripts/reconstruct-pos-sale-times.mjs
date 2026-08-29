/**
 * Reconstructs POS sale clock times that were stored as Mexico City noon.
 * Uses the earliest order_items.created_at (still the real insert time).
 *
 * Preview: node scripts/reconstruct-pos-sale-times.mjs
 * Apply:   node scripts/reconstruct-pos-sale-times.mjs --apply
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv() {
  for (const file of ['.env', 'apps/admin/.env.local']) {
    try {
      for (const line of readFileSync(resolve(file), 'utf8').split('\n')) {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2].replace(/^"|"$/g, '');
        }
      }
    } catch {
      // optional env file
    }
  }
}

loadEnv();

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const apply = process.argv.includes('--apply');
const mexicoFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Mexico_City',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  hourCycle: 'h23',
});

function mexicoParts(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = mexicoFmt.formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? '';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return {
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${hour}:${get('minute')}:${get('second')}`,
    hour,
    minute: get('minute'),
    second: get('second'),
  };
}

function mexicoClockIso(ymd, iso) {
  const parts = mexicoParts(iso);
  if (!parts) return null;
  return `${ymd}T${parts.time}-06:00`;
}

function isNoon(iso) {
  const parts = mexicoParts(iso);
  return Boolean(parts && parts.hour === '12' && parts.minute === '00' && parts.second === '00');
}

function formatMexico(iso) {
  const parts = mexicoParts(iso);
  if (!parts) return iso;
  return `${parts.ymd} ${parts.time}`;
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function fetchAllPosOrders() {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, created_at, paid_at, source')
      .eq('source', 'pos')
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function fetchFirstItemTimes(orderIds) {
  const times = new Map();
  const pageSize = 200;
  for (let i = 0; i < orderIds.length; i += pageSize) {
    const chunk = orderIds.slice(i, i + pageSize);
    const { data, error } = await supabase
      .from('order_items')
      .select('order_id, created_at')
      .in('order_id', chunk);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const prev = times.get(row.order_id);
      if (!prev || row.created_at < prev) times.set(row.order_id, row.created_at);
    }
  }
  return times;
}

const orders = await fetchAllPosOrders();
const noonOrders = orders.filter((order) => isNoon(order.created_at));
const itemTimes = await fetchFirstItemTimes(noonOrders.map((order) => order.id));

const plan = [];
const skipped = [];

for (const order of noonOrders) {
  const itemAt = itemTimes.get(order.id);
  if (!itemAt) {
    skipped.push({ order, reason: 'sin partidas' });
    continue;
  }
  const orderParts = mexicoParts(order.created_at);
  const itemParts = mexicoParts(itemAt);
  if (!orderParts || !itemParts) {
    skipped.push({ order, reason: 'fecha inválida' });
    continue;
  }

  const reconstructedIso =
    itemParts.ymd === orderParts.ymd ? itemAt : mexicoClockIso(orderParts.ymd, itemAt);
  if (!reconstructedIso) {
    skipped.push({ order, reason: 'sin hora reconstruible' });
    continue;
  }

  const newParts = mexicoParts(reconstructedIso);
  if (!newParts || newParts.ymd !== orderParts.ymd) {
    skipped.push({ order, reason: 'cambiaría el día' });
    continue;
  }
  if (newParts.time === orderParts.time) {
    skipped.push({ order, reason: 'sin cambio de hora' });
    continue;
  }

  plan.push({
    id: order.id,
    order_number: order.order_number,
    old_created_at: order.created_at,
    new_created_at: reconstructedIso,
    update_paid_at: order.paid_at == null || isNoon(order.paid_at),
    same_day: itemParts.ymd === orderParts.ymd,
    item_at: itemAt,
  });
}

const sameDay = plan.filter((row) => row.same_day);
const backdated = plan.filter((row) => !row.same_day);
const summarize = (row) => ({
  order_number: row.order_number,
  from: formatMexico(row.old_created_at),
  to: formatMexico(row.new_created_at),
  item: formatMexico(row.item_at),
  same_day: row.same_day,
});

console.log(
  JSON.stringify(
    {
      posOrders: orders.length,
      noonOrders: noonOrders.length,
      toUpdate: plan.length,
      sameDay: sameDay.length,
      backdated: backdated.length,
      skipped: skipped.length,
      skippedReasons: skipped.reduce((acc, row) => {
        acc[row.reason] = (acc[row.reason] ?? 0) + 1;
        return acc;
      }, {}),
      apply,
      sameDaySamples: sameDay.slice(0, 8).map(summarize),
      backdatedSamples: backdated.slice(0, 5).map(summarize),
    },
    null,
    2,
  ),
);

if (!apply) process.exit(0);

let updated = 0;
for (const row of plan) {
  const patch = { created_at: row.new_created_at };
  if (row.update_paid_at) patch.paid_at = row.new_created_at;
  const { error } = await supabase.from('orders').update(patch).eq('id', row.id);
  if (error) throw new Error(`Pedido #${row.order_number}: ${error.message}`);
  updated += 1;
}

console.log(JSON.stringify({ updated }, null, 2));
