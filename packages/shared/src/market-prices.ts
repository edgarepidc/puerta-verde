export const DEFAULT_SALE_MARGIN_PERCENT = 35;
export const MIN_SALE_MARGIN_PERCENT = 15;
export const MARKET_DISCOUNT_PERCENT = 10;

export type MarketStore = 'walmart' | 'chedraui' | 'lacomer' | 'manual';

export interface MarketOffer {
  store: MarketStore;
  storeLabel: string;
  title: string;
  price: number;
  unitHint?: string | null;
  url?: string | null;
}

export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function suggestSalePrice(input: {
  cost?: number | null;
  currentPrice?: number | null;
  marketPrices?: number[];
  defaultMarginPercent?: number;
}): number {
  const margin = input.defaultMarginPercent ?? DEFAULT_SALE_MARGIN_PERCENT;
  const discount = MARKET_DISCOUNT_PERCENT / 100;
  const cost = Number(input.cost ?? 0);
  const market = (input.marketPrices ?? []).filter((price) => Number.isFinite(price) && price > 0);
  const cheapestMarket = market.length ? Math.min(...market) : 0;

  if (cheapestMarket) return roundMoney(cheapestMarket * (1 - discount));
  if (cost > 0) return roundMoney(cost * (1 + margin / 100));
  return roundMoney(Number(input.currentPrice ?? 0));
}

export function applyPriceAdjustment(
  base: number,
  kind: 'amount' | 'percent',
  value: number,
): number {
  const next = kind === 'amount' ? base + value : base * (1 + value / 100);
  return roundMoney(Math.max(0, next));
}
