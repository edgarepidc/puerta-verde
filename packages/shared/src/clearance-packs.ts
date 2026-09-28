function formatPackMoney(amount: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
export const CLEARANCE_PACK_DEFAULT_TITLE = 'Paquete de último momento';
export const CLEARANCE_PACK_DRAFT_KEY = 'pv.clearancePackDraft';

export interface ClearancePackDraftItem {
  branchProductId: string;
  name: string;
  unit?: string;
  quantity: number;
  pieces?: number;
}

export interface ClearancePackItemInput {
  branchProductId: string;
  quantity: number;
  pieces?: number | null;
}

export interface AssembleClearancePackInput {
  title?: string;
  price: number;
  bagCount: number;
  items: ClearancePackItemInput[];
  notifyNeighbors?: boolean;
  templateId?: string | null;
  saveTemplate?: boolean;
}

export interface ClearancePackTemplateItem {
  productId: string;
  piecesPerBag: number | null;
  quantityPerBag: number | null;
}

export interface ClearancePackTemplate {
  id: string;
  title: string;
  defaultPrice: number;
  defaultBagCount: number;
  items: ClearancePackTemplateItem[];
}

export interface ClearancePackCatalogProduct {
  branchProductId: string;
  productId: string;
  unit?: string | null;
  weighAtFulfillment?: boolean | null;
}

export function isWeighProduce(input: {
  unit?: string | null;
  weighAtFulfillment?: boolean | null;
}) {
  return Boolean(input.weighAtFulfillment) && input.unit === 'kg';
}

export function totalFromPerBag(perBag: number, bagCount: number) {
  const bags = Math.max(0, Math.round(Number(bagCount) || 0));
  const per = Number(perBag);
  if (!(per > 0) || bags <= 0) return 0;
  return Number((per * bags).toFixed(3));
}

export function perBagFromTotal(total: number, bagCount: number) {
  const bags = Math.max(1, Math.round(Number(bagCount) || 0));
  const qty = Number(total);
  if (!(qty > 0)) return 0;
  return Number((qty / bags).toFixed(3));
}

export function preloadPackTemplate(input: {
  items: ClearancePackTemplateItem[];
  catalog: ClearancePackCatalogProduct[];
  bagCount: number;
}) {
  const bags = Math.max(1, Math.round(Number(input.bagCount) || 0));
  const lines: Array<{
    branchProductId: string;
    quantity: number;
    pieces: number | null;
    piecesPerBag: number | null;
    quantityPerBag: number | null;
  }> = [];
  for (const item of input.items) {
    const product = input.catalog.find((row) => row.productId === item.productId);
    if (!product) continue;
    const weigh = isWeighProduce(product);
    const piecesPerBag =
      weigh && Number(item.piecesPerBag) > 0 ? Number(item.piecesPerBag) : null;
    const quantityPerBag =
      !weigh && Number(item.quantityPerBag) > 0 ? Number(item.quantityPerBag) : null;
    lines.push({
      branchProductId: product.branchProductId,
      quantity: quantityPerBag ? totalFromPerBag(quantityPerBag, bags) : 0,
      pieces: piecesPerBag ? totalFromPerBag(piecesPerBag, bags) : null,
      piecesPerBag,
      quantityPerBag,
    });
  }
  return lines;
}

export function validateAssembleClearancePack(input: AssembleClearancePackInput): string | null {
  if (!(Number(input.price) > 0)) return 'Indica el precio de la bolsa.';
  const bags = Number(input.bagCount);
  if (!Number.isInteger(bags) || bags <= 0) return 'Indica cuántas bolsas armas.';
  if (!input.items.length) return 'Agrega al menos un producto al paquete.';
  const seen = new Set<string>();
  for (const item of input.items) {
    if (!item.branchProductId) return 'Selecciona los productos del paquete.';
    if (seen.has(item.branchProductId)) return 'Ese producto ya está en el paquete.';
    seen.add(item.branchProductId);
    if (!(Number(item.quantity) > 0)) return 'Cada producto necesita cantidad mayor a cero.';
    if (item.pieces != null && item.pieces !== undefined && !(Number(item.pieces) > 0)) {
      return 'Indica las piezas de cada producto que se vende por pieza.';
    }
  }
  return null;
}

export function formatClearancePackPromoBody(input: {
  remaining: number;
  price: number;
  contents: string[];
  branchName: string;
}): string {
  const bags = Math.round(Number(input.remaining));
  const bagLabel = bags === 1 ? 'bolsa' : 'bolsas';
  const contents = input.contents.map((name) => name.trim()).filter(Boolean);
  const lines = [
    `Quedan ${bags} ${bagLabel} a ${formatPackMoney(Number(input.price))}.`,
    contents.length ? contents.join(', ') : null,
    `Hoy en ${input.branchName.trim() || 'la tienda'} — pásate a recogerlo.`,
  ];
  return lines.filter((line): line is string => Boolean(line)).join('\n');
}

export function buildVisitStoreBroadcastMessage(input: {
  title: string;
  body: string | null;
  branchName: string;
}): string {
  const lines = [`*${input.title.trim()}* 🍊`];
  if (input.body?.trim()) lines.push(input.body.trim());
  lines.push('', `Ven a ${input.branchName.trim() || 'la tienda'} — no se pide en línea.`);
  return lines.join('\n');
}
