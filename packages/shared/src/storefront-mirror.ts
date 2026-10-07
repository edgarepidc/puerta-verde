import { roundMoney } from './market-prices';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_SLUGS = new Set(['api', 'pedido', 'registro']);

export function normalizeStorefrontSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Price the other zone sees: La Cité price, then the shipping markup. */
export function markedUpUnitPrice(price: number, markupPercent: number): number {
  const base = Number(price);
  const markup = Number(markupPercent);
  if (!Number.isFinite(base) || base < 0) return 0;
  if (!Number.isFinite(markup) || markup <= 0) return roundMoney(base);
  return roundMoney(base * (1 + markup / 100));
}

export function storefrontInputError(input: {
  name: string;
  slug: string;
  markupPercent: number;
}): string | null {
  if (!input.name.trim()) return 'Escribe el nombre de la otra zona.';
  const slug = normalizeStorefrontSlug(input.slug);
  if (slug.length < 2 || slug.length > 40 || !SLUG_RE.test(slug)) {
    return 'La liga solo puede tener letras, números y guiones.';
  }
  if (RESERVED_SLUGS.has(slug)) return 'Esa liga está reservada. Elige otra.';
  if (!Number.isFinite(input.markupPercent) || input.markupPercent < 0 || input.markupPercent > 200) {
    return 'El porcentaje tiene que estar entre 0 y 200.';
  }
  return null;
}
