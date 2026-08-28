/**
 * Catálogo central de permissões granulares da aplicação.
 * Guards de autorização SEMPRE verificam por permissão, nunca apenas pelo nome da role.
 */
export const PERMISSIONS = {
  PRODUCT_READ: 'product.read',
  PRODUCT_CREATE: 'product.create',
  PRODUCT_UPDATE: 'product.update',
  PRODUCT_DELETE: 'product.delete',

  ORDER_READ: 'order.read',
  ORDER_CREATE: 'order.create',
  ORDER_UPDATE: 'order.update',

  INVENTORY_READ: 'inventory.read',
  INVENTORY_ADJUST: 'inventory.adjust',

  FINANCE_READ: 'finance.read',
  FINANCE_MANAGE: 'finance.manage',

  FISCAL_READ: 'fiscal.read',
  FISCAL_EXPORT: 'fiscal.export',

  INTEGRATION_READ: 'integration.read',
  INTEGRATION_MANAGE: 'integration.manage',

  REPORT_READ: 'report.read',

  SETTINGS_MANAGE: 'settings.manage',
  USERS_MANAGE: 'users.manage',
  AUDIT_READ: 'audit.read',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

export const ROLE_NAMES = ['ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

/**
 * Matriz padrão role -> permissões, usada no seed e na criação de roles.
 * ADMIN sempre recebe todas as permissões.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleName, PermissionKey[]> = {
  ADMIN: [...ALL_PERMISSIONS],
  MANAGER: [
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.PRODUCT_CREATE,
    PERMISSIONS.PRODUCT_UPDATE,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_UPDATE,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_ADJUST,
    PERMISSIONS.FINANCE_READ,
    PERMISSIONS.FINANCE_MANAGE,
    PERMISSIONS.FISCAL_READ,
    PERMISSIONS.FISCAL_EXPORT,
    PERMISSIONS.INTEGRATION_READ,
    PERMISSIONS.REPORT_READ,
    PERMISSIONS.AUDIT_READ,
  ],
  OPERATOR: [
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.PRODUCT_CREATE,
    PERMISSIONS.PRODUCT_UPDATE,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_UPDATE,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_ADJUST,
    PERMISSIONS.FISCAL_READ,
    PERMISSIONS.REPORT_READ,
  ],
  VIEWER: [
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.FINANCE_READ,
    PERMISSIONS.FISCAL_READ,
    PERMISSIONS.INTEGRATION_READ,
    PERMISSIONS.REPORT_READ,
  ],
};
