export const BRAND_NAME = 'Puerta Verde';

export {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  ORDER_WORKFLOW_STATUSES,
  formatMexicoDayLabel,
  groupByMexicoDay,
  isOrderStatus,
  isOrderWorkflowStatus,
  mexicoYmdFromIso,
  nextWorkflowStatus,
  normalizeOrderStatus,
  orderStatusLabel,
  previousWorkflowStatus,
  todayMexicoYmd,
  type MexicoDayGroup,
  type OrderStatus,
  type OrderWorkflowStatus,
} from './order-status';

export {
  buildSalesExportTables,
  salesExportFilename,
  type SalesExportItem,
  type SalesExportOrder,
} from './sales-export';

export {
  PERMISSION_KEYS,
  PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  canEditPermissionMatrix,
  isPermissionKey,
  normalizePermissionMatrixInput,
  parsePermissionsFromOrgSettings,
  resolvePermissionMatrix,
  roleHasPermission,
  type PermissionDefinition,
  type PermissionKey,
  type PermissionMatrix,
} from './permissions';

export const FULFILLMENT_TYPES = ['delivery', 'pickup'] as const;
export type FulfillmentType = (typeof FULFILLMENT_TYPES)[number];

export const PAYMENT_METHODS = ['cash', 'card_terminal', 'transfer', 'online'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card_terminal: 'TPV',
  transfer: 'Transferencia',
  online: 'En línea',
};

export const PAYMENT_STATUSES = ['pending', 'paid', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PRODUCT_UNITS = ['kg', 'piece', 'bunch', 'bag', 'liter', 'box'] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export {
  STAFF_ROLES,
  LEGACY_STAFF_ROLES,
  STAFF_ROLE_LABELS,
  normalizeStaffRole,
  isStaffRole,
  type StaffRole,
} from './staff-roles';

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
  box: 'caja',
};

export const WALK_IN_PHONE = '520000000000';
export const WALK_IN_NAME = 'Cliente de paso';

export function isWalkInPhone(phone: string): boolean {
  return normalizePhone(phone) === WALK_IN_PHONE;
}

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
  /** Free-text department / unit label for delivery */
  deliveryUnit?: string | null;
  unitId?: string | null;
  deliveryNotes?: string | null;
  walkIn?: boolean;
  items: Array<{
    branchProductId: string;
    /** Kg (or unit) charged / deducted from stock */
    quantity: number;
    /** Pieces ordered when selling weigh_at_fulfillment by piece */
    orderedQuantity?: number | null;
  }>;
}

export {
  validateProductInput,
  DEMO_PRODUCT_NAMES,
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
  COUPON_DISCOUNT_TYPES,
  COUPON_DISCOUNT_TYPE_LABELS,
  normalizeCouponCode,
  validateCouponInput,
  computeCouponDiscount,
  couponValidityError,
  evaluateCoupon,
  type CouponDiscountType,
  type CouponInput,
  type CouponRecord,
} from './coupons';

export {
  validateInventoryMovement,
  INVENTORY_MOVEMENT_TYPES,
  INVENTORY_MOVEMENT_LABELS,
  MANUAL_INVENTORY_TYPES,
  LOW_STOCK_THRESHOLD,
  CHILE_LOW_STOCK_KG,
  isChileProduct,
  getDefaultLowStockThreshold,
  isLowStock,
  type InventoryMovementInput,
  type InventoryMovementType,
  type ManualInventoryMovementType,
} from './inventory';

export {
  PRODUCT_QUALITIES,
  PRODUCT_QUALITY_LABELS,
  isProductQuality,
  validatePurchaseInput,
  validateSupplierInput,
  type ProductQuality,
  type PurchaseInput,
  type PurchaseItemInput,
  type SupplierInput,
} from './purchases';

export {
  applyDiscount,
  DEFAULT_ESTIMATED_KG_PER_PIECE,
  estimatedKgForPieces,
  formatProductQuantity,
  getActiveDiscountPercent,
  getDefaultQuantity,
  getQuantityStep,
  getStockStatus,
  maxPiecesFromStock,
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
  applyPriceAdjustment,
  DEFAULT_SALE_MARGIN_PERCENT,
  MIN_SALE_MARGIN_PERCENT,
  roundMoney,
  suggestSalePrice,
  type MarketOffer,
  type MarketStore,
} from './market-prices';

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
  VISIT_EXPENSE_PRESETS,
  validateExpenseInput,
  type ExpenseInput,
  type VisitExpensePreset,
} from './expenses';
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
  if (!input.walkIn && !input.customerName.trim()) return 'El nombre es obligatorio.';
  if (!input.walkIn && !isValidMexicanPhone(input.customerPhone)) {
    return 'Ingresa un teléfono válido de 10 dígitos.';
  }
  const deliveryUnit = (input.deliveryUnit ?? '').trim() || (input.unitId ?? '').trim();
  if (input.fulfillmentType === 'delivery' && !deliveryUnit) {
    return 'Ingresa tu domicilio para la entrega.';
  }
  if (!input.items.length) return 'Agrega al menos un producto.';
  for (const item of input.items) {
    if (item.quantity <= 0) return 'Cantidad inválida.';
    if (item.orderedQuantity != null && !(item.orderedQuantity > 0)) {
      return 'Las piezas deben ser mayores a cero.';
    }
  }
  return null;
}
