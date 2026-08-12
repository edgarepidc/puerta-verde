export const PROMOTION_KINDS = ['banner', 'discount', 'bundle'] as const;
export type PromotionKind = (typeof PROMOTION_KINDS)[number];

export const PROMOTION_KIND_LABELS: Record<PromotionKind, string> = {
  banner: 'Aviso / banner',
  discount: 'Descuento',
  bundle: 'Paquete / combo',
};

export interface PromotionInput {
  title: string;
  body?: string | null;
  kind: PromotionKind;
  imageUrl?: string | null;
  discountPercent?: number | null;
  productId?: string | null;
  categoryId?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive: boolean;
}

export function validatePromotionInput(input: PromotionInput): string | null {
  if (!input.title.trim()) return 'El título es obligatorio.';
  if (!PROMOTION_KINDS.includes(input.kind)) return 'Tipo de promoción inválido.';
  if (input.kind === 'discount') {
    const pct = input.discountPercent ?? 0;
    if (pct <= 0 || pct > 100) return 'Indica un descuento entre 1 y 100%.';
  }
  if (input.startsAt && input.endsAt && input.endsAt < input.startsAt) {
    return 'La fecha de fin debe ser posterior al inicio.';
  }
  return null;
}
