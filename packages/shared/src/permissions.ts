import {
  STAFF_ROLES,
  normalizeStaffRole,
  type StaffRole,
} from './staff-roles';

export type { StaffRole };

export const PERMISSION_KEYS = [
  'pos.edit_price',
  'sales.export',
  'staff.manage',
  'branch.settings',
  'purchases.manage',
  'inventory.adjust',
  'products.manage',
  'promotions.manage',
  'cash.closing',
  'profit.view',
  'stock.thresholds',
  'orders.edit',
  'orders.edit_payment',
  'orders.delete',
  'coupons.manage',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export interface PermissionDefinition {
  key: PermissionKey;
  label: string;
  description: string;
}

export const PERMISSIONS: PermissionDefinition[] = [
  {
    key: 'pos.edit_price',
    label: 'Editar precio en venta mostrador',
    description: 'Permite cambiar el precio unitario al cobrar en mostrador.',
  },
  {
    key: 'sales.export',
    label: 'Exportar ventas (Excel)',
    description: 'Descargar el respaldo de ventas entregadas por día.',
  },
  {
    key: 'staff.manage',
    label: 'Gestionar usuarios del panel',
    description: 'Invitar, editar roles y administrar suscripción.',
  },
  {
    key: 'branch.settings',
    label: 'Editar datos de la sucursal',
    description: 'Cambiar dirección, WhatsApp, horarios y modo de entrega.',
  },
  {
    key: 'purchases.manage',
    label: 'Registrar y editar compras',
    description: 'Altas, ediciones y bajas de compras a proveedores.',
  },
  {
    key: 'inventory.adjust',
    label: 'Ajustar inventario',
    description: 'Movimientos manuales de stock (ajuste, merma).',
  },
  {
    key: 'products.manage',
    label: 'Gestionar catálogo',
    description: 'Crear y editar productos, precios y disponibilidad.',
  },
  {
    key: 'promotions.manage',
    label: 'Gestionar promociones',
    description: 'Crear, editar y publicar promociones en la tienda.',
  },
  {
    key: 'cash.closing',
    label: 'Cerrar caja del día',
    description: 'Registrar el corte de caja y conteo de efectivo.',
  },
  {
    key: 'profit.view',
    label: 'Ver utilidades y márgenes',
    description: 'Consultar márgenes, costos operativos y reportes de utilidad.',
  },
  {
    key: 'stock.thresholds',
    label: 'Editar límites de stock bajo',
    description: 'Definir el umbral de stock bajo por categoría de producto.',
  },
  {
    key: 'orders.edit',
    label: 'Editar cantidades del pedido',
    description: 'Ajustar kilos/piezas al pesar para que cuadre con lo vendido.',
  },
  {
    key: 'orders.edit_payment',
    label: 'Editar forma de pago',
    description: 'Cambiar efectivo, TPV, transferencia o dejar el pedido por pagar.',
  },
  {
    key: 'orders.delete',
    label: 'Eliminar pedidos',
    description: 'Borrar un pedido y devolver el stock al inventario.',
  },
  {
    key: 'coupons.manage',
    label: 'Gestionar cupones de descuento',
    description: 'Crear y editar cupones con vigencia (porcentaje o monto fijo).',
  },
];

/** Default roles that have each permission. */
export const DEFAULT_ROLE_PERMISSIONS: Record<PermissionKey, StaffRole[]> = {
  'pos.edit_price': ['owner', 'branch_manager'],
  'sales.export': ['owner', 'branch_manager', 'staff'],
  'staff.manage': ['owner', 'branch_manager'],
  'branch.settings': ['owner', 'branch_manager'],
  'purchases.manage': ['owner', 'branch_manager', 'staff'],
  'inventory.adjust': ['owner', 'branch_manager', 'staff'],
  'products.manage': ['owner', 'branch_manager', 'staff'],
  'promotions.manage': ['owner', 'branch_manager'],
  'cash.closing': ['owner', 'branch_manager', 'staff'],
  'profit.view': ['owner', 'branch_manager'],
  'stock.thresholds': ['owner', 'branch_manager'],
  'orders.edit': ['owner', 'branch_manager', 'staff'],
  'orders.edit_payment': ['owner', 'branch_manager'],
  'orders.delete': ['owner', 'branch_manager'],
  'coupons.manage': ['owner', 'branch_manager'],
};

export type PermissionMatrix = Record<PermissionKey, StaffRole[]>;

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}

function sanitizeRoles(roles: unknown): StaffRole[] {
  if (!Array.isArray(roles)) return [];
  const unique = new Set<StaffRole>();
  for (const role of roles) {
    if (typeof role !== 'string') continue;
    const normalized = normalizeStaffRole(role);
    if (normalized) unique.add(normalized);
  }
  // Owner always keeps every permission.
  unique.add('owner');
  return STAFF_ROLES.filter((role) => unique.has(role));
}

/** Merge stored org settings with defaults. Invalid keys/roles are ignored. */
export function resolvePermissionMatrix(raw: unknown): PermissionMatrix {
  const stored =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const matrix = {} as PermissionMatrix;
  for (const key of PERMISSION_KEYS) {
    const value = stored[key];
    matrix[key] =
      value === undefined
        ? [...DEFAULT_ROLE_PERMISSIONS[key]]
        : sanitizeRoles(value);
  }
  return matrix;
}

export function parsePermissionsFromOrgSettings(settings: unknown): PermissionMatrix {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return resolvePermissionMatrix(null);
  }
  const permissions = (settings as Record<string, unknown>).permissions;
  return resolvePermissionMatrix(permissions);
}

export function roleHasPermission(
  role: StaffRole,
  key: PermissionKey,
  matrix: PermissionMatrix,
): boolean {
  if (role === 'owner') return true;
  return matrix[key]?.includes(role) ?? false;
}

export function canEditPermissionMatrix(role: StaffRole): boolean {
  return role === 'owner' || role === 'branch_manager';
}

/** Normalize UI payload before saving; always force owner on every key. */
export function normalizePermissionMatrixInput(input: unknown): PermissionMatrix {
  return resolvePermissionMatrix(input);
}
