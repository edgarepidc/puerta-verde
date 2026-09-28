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
}

export interface ClearancePackItemInput {
  branchProductId: string;
  quantity: number;
}

export interface AssembleClearancePackInput {
  title?: string;
  price: number;
  bagCount: number;
  items: ClearancePackItemInput[];
  notifyNeighbors?: boolean;
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
