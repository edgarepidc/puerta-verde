export const BRAND_NAME = 'Puerta Verde';

export const ORDER_STATUSES = [
  'pending',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const FULFILLMENT_TYPES = ['delivery', 'pickup'] as const;
export type FulfillmentType = (typeof FULFILLMENT_TYPES)[number];

export const PAYMENT_METHODS = ['cash', 'card_terminal', 'transfer', 'online'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['pending', 'paid', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PRODUCT_UNITS = ['kg', 'piece', 'bunch', 'bag', 'liter'] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export const STAFF_ROLES = ['owner', 'org_admin', 'branch_manager', 'staff'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  owner: 'Propietario',
  org_admin: 'Administrador',
  branch_manager: 'Gerente de sucursal',
  staff: 'Personal',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Recibido',
  preparing: 'Preparando',
  ready: 'Listo',
  out_for_delivery: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

export const FULFILLMENT_LABELS: Record<FulfillmentType, string> = {
  delivery: 'Entrega a domicilio',
  pickup: 'Paso a recoger',
};

export const PRODUCT_UNIT_LABELS: Record<ProductUnit, string> = {
  kg: 'kg',
  piece: 'pieza',
  bunch: 'manojo',
  bag: 'bolsa',
  liter: 'litro',
};

export function formatMoney(amount: number, currency = 'MXN'): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `52${digits}`;
  if (digits.startsWith('52') && digits.length === 12) return digits;
  return digits;
}

export function isValidMexicanPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  return /^52\d{10}$/.test(normalized);
}

export interface GuestCheckoutInput {
  customerName: string;
  customerPhone: string;
  fulfillmentType: FulfillmentType;
  unitId?: string | null;
  deliveryNotes?: string | null;
  items: Array<{
    branchProductId: string;
    quantity: number;
  }>;
}

export {
  validateProductInput,
  type ProductInput,
} from './products';

export {
  validatePromotionInput,
  PROMOTION_KINDS,
  PROMOTION_KIND_LABELS,
  type PromotionInput,
  type PromotionKind,
} from './promotions';

export {
  validateInventoryMovement,
  INVENTORY_MOVEMENT_TYPES,
  INVENTORY_MOVEMENT_LABELS,
  MANUAL_INVENTORY_TYPES,
  LOW_STOCK_THRESHOLD,
  type InventoryMovementInput,
  type InventoryMovementType,
  type ManualInventoryMovementType,
} from './inventory';

export {
  validatePurchaseInput,
  validateSupplierInput,
  type PurchaseInput,
  type PurchaseItemInput,
  type SupplierInput,
} from './purchases';

export {
  applyDiscount,
  formatProductQuantity,
  getActiveDiscountPercent,
  getDefaultQuantity,
  getQuantityStep,
  getStockStatus,
  STOCK_STATUS_LABELS,
  type StockStatus,
} from './storefront';

export {
  buildPtiLabelString,
  formatGtin14,
  parseScaleWeightLine,
  type PtiLabelInput,
} from './scale';

export {
  calcMarginAmount,
  calcMarginPercent,
  validateOperatingCostInput,
  OPERATING_COST_TYPES,
  OPERATING_COST_PERIODS,
  OPERATING_COST_TYPE_LABELS,
  OPERATING_COST_PERIOD_LABELS,
  type OperatingCostInput,
  type OperatingCostType,
  type OperatingCostPeriod,
} from './profitability';

export {
  COST_IMPORT_TEMPLATE_CSV,
  mapCostImportHeaders,
  normalizeProductName,
  parseCostImportRows,
  type CostImportRow,
  type ParsedCostImportRow,
} from './cost-import';

export {
  validateOnboardingInput,
  slugifyOrganizationName,
  type OnboardingInput,
} from './onboarding';

export {
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUSES,
  PLAN_LABELS,
  PLAN_PRICES_MXN,
  STATUS_LABELS,
  isSubscriptionUsable,
  daysUntilTrialEnd,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from './billing';

export function validateGuestCheckout(input: GuestCheckoutInput): string | null {
  if (!input.customerName.trim()) return 'El nombre es obligatorio.';
  if (!isValidMexicanPhone(input.customerPhone)) return 'Ingresa un teléfono válido de 10 dígitos.';
  if (input.fulfillmentType === 'delivery' && !input.unitId) {
    return 'Selecciona tu departamento para la entrega.';
  }
  if (!input.items.length) return 'Agrega al menos un producto.';
  for (const item of input.items) {
    if (item.quantity <= 0) return 'Cantidad inválida.';
  }
  return null;
}
