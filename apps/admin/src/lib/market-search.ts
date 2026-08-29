import type { MarketOffer } from '@puertaverde/shared';

const FETCH_TIMEOUT_MS = 8000;
const BROWSER_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const LACOMER_STORE_ID = '287'; // Coyoacán — sucursal pública de referencia CDMX

function moneyFromUnknown(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value * 100) / 100;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d.]/g, ''));
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed * 100) / 100;
  }
  return null;
}

async function fetchText(url: string, extraHeaders: Record<string, string> = {}): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': BROWSER_UA,
        accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'accept-language': 'es-MX,es;q=0.9,en;q=0.8',
        ...extraHeaders,
      },
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function decodeHtml(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseChedraui(payload: string): MarketOffer[] {
  try {
    const data = JSON.parse(payload) as Array<{
      productName?: string;
      link?: string;
      items?: Array<{
        sellers?: Array<{ commertialOffer?: { Price?: number } }>;
      }>;
    }>;
    if (!Array.isArray(data)) return [];
    const offers: MarketOffer[] = [];
    for (const item of data) {
      const price = moneyFromUnknown(item.items?.[0]?.sellers?.[0]?.commertialOffer?.Price);
      if (!price) continue;
      offers.push({
        store: 'chedraui',
        storeLabel: 'Chedraui',
        title: item.productName?.trim() || 'Producto Chedraui',
        price,
        url: item.link ? `https://www.chedraui.com.mx${item.link}` : null,
      });
    }
    return offers.slice(0, 5);
  } catch {
    return [];
  }
}

function parseLaComer(payload: string): MarketOffer[] {
  try {
    const data = JSON.parse(payload) as {
      res?: Array<{
        artDes?: string;
        artDesCom?: string;
        artPrven?: number;
        artEan?: string | number;
      }>;
    };
    const offers: MarketOffer[] = [];
    for (const item of data.res ?? []) {
      const price = moneyFromUnknown(item.artPrven);
      const title = (item.artDesCom || item.artDes || '').trim();
      if (!price || !title) continue;
      offers.push({
        store: 'lacomer',
        storeLabel: 'La Comer',
        title,
        price,
        url: item.artEan
          ? `https://www.lacomer.com.mx/lacomer/#/detallearticulo/${item.artEan}`
          : null,
      });
      if (offers.length >= 5) break;
    }
    return offers;
  } catch {
    return [];
  }
}

export function parseBingWalmartHtml(html: string): MarketOffer[] {
  const offers: MarketOffer[] = [];
  const seen = new Set<string>();
  const pattern =
    /br-pdItemName[^>]*>\s*([^<]{3,140})\s*<\/div>[\s\S]{0,500}?pd-price[^>]*>\s*(\$[^<]+)\s*<\/div>([\s\S]{0,1200}?br-sellerBlock[\s\S]{0,500})/gi;

  for (const match of html.matchAll(pattern)) {
    const sellerChunk = match[3] ?? '';
    if (!/walmart/i.test(sellerChunk)) continue;
    const title = decodeHtml((match[1] ?? '').trim());
    const price = moneyFromUnknown(match[2]);
    if (!title || !price) continue;
    const key = `${title.toLowerCase()}-${price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    offers.push({
      store: 'walmart',
      storeLabel: 'Walmart',
      title,
      price,
      url: 'https://www.walmart.com.mx/search?q=' + encodeURIComponent(title),
    });
    if (offers.length >= 5) break;
  }
  return offers;
}

export function parseWalmartSearchHtml(html: string): MarketOffer[] {
  const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextMatch?.[1]) {
    try {
      const data = JSON.parse(nextMatch[1]) as {
        props?: {
          pageProps?: {
            initialData?: {
              searchResult?: {
                itemStacks?: Array<{
                  items?: Array<{
                    name?: string | null;
                    canonicalUrl?: string | null;
                    priceInfo?: {
                      linePrice?: string;
                      linePriceDisplay?: string;
                      itemPrice?: string;
                    } | null;
                  }>;
                }>;
              };
            };
          };
        };
      };
      const items =
        data.props?.pageProps?.initialData?.searchResult?.itemStacks?.flatMap(
          (stack) => stack.items ?? [],
        ) ?? [];
      const offers: MarketOffer[] = [];
      for (const item of items) {
        const name = item.name?.trim();
        const price = moneyFromUnknown(
          item.priceInfo?.linePrice || item.priceInfo?.linePriceDisplay || item.priceInfo?.itemPrice,
        );
        if (!name || !price) continue;
        const path = item.canonicalUrl?.trim() ?? '';
        offers.push({
          store: 'walmart',
          storeLabel: 'Walmart',
          title: name,
          price,
          url: path
            ? `https://www.walmart.com.mx${path.startsWith('/') ? path : `/${path}`}`
            : null,
        });
        if (offers.length >= 5) break;
      }
      if (offers.length) return offers;
    } catch {
      /* fall through */
    }
  }

  const offers: MarketOffer[] = [];
  const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  for (const match of jsonLd) {
    try {
      const data = JSON.parse(match[1] ?? '') as {
        '@type'?: string;
        name?: string;
        offers?: { price?: string | number; url?: string };
      };
      const type = data['@type'];
      if (type !== 'Product' && type !== 'Offer') continue;
      const price = moneyFromUnknown(data.offers?.price);
      if (!price) continue;
      offers.push({
        store: 'walmart',
        storeLabel: 'Walmart',
        title: data.name?.trim() || 'Producto Walmart',
        price,
        url: data.offers?.url ?? null,
      });
    } catch {
      /* ignore malformed blocks */
    }
  }
  return offers.slice(0, 5);
}

export async function searchMarketPrices(query: string): Promise<{
  query: string;
  offers: MarketOffer[];
  sources: { walmart: boolean; chedraui: boolean; lacomer: boolean };
}> {
  const q = query.trim();
  if (q.length < 2) {
    return { query: q, offers: [], sources: { walmart: false, chedraui: false, lacomer: false } };
  }

  const encoded = encodeURIComponent(q);
  const bingQuery = encodeURIComponent(`${q} walmart mexico`);
  const [chedrauiText, lacomerText, walmartHtml, bingHtml] = await Promise.all([
    fetchText(
      `https://www.chedraui.com.mx/api/catalog_system/pub/products/search?ft=${encoded}&_from=0&_to=4`,
    ),
    fetchText(
      `https://lacomer-vector-test.buscador.amarello.com.mx/searchArtPrior?s=${encoded}&succId=${LACOMER_STORE_ID}&col=lacomer_2&p=1&npagel=5`,
    ),
    fetchText(`https://www.walmart.com.mx/search?q=${encoded}`, {
      referer: 'https://www.walmart.com.mx/',
    }),
    fetchText(`https://www.bing.com/shop?q=${bingQuery}`, {
      referer: 'https://www.bing.com/',
    }),
  ]);

  const chedraui = chedrauiText ? parseChedraui(chedrauiText) : [];
  const lacomer = lacomerText ? parseLaComer(lacomerText) : [];
  const walmartDirect = walmartHtml ? parseWalmartSearchHtml(walmartHtml) : [];
  const walmartBing = bingHtml ? parseBingWalmartHtml(bingHtml) : [];
  const walmart = walmartDirect.length ? walmartDirect : walmartBing;

  return {
    query: q,
    offers: [...walmart, ...chedraui, ...lacomer],
    sources: {
      walmart: walmart.length > 0,
      chedraui: chedraui.length > 0,
      lacomer: lacomer.length > 0,
    },
  };
}
