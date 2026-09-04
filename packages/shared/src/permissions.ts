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

  // Granulares da integração TikTok Shop (seção 52 da Fase 3) — mais finas que
  // INTEGRATION_MANAGE porque conectar/reconectar uma loja, disparar sincronização e enviar
  // estoque para o marketplace têm níveis de risco bem diferentes entre si.
  INTEGRATION_TIKTOK_READ: 'integration.tiktok.read',
  INTEGRATION_TIKTOK_CONNECT: 'integration.tiktok.connect',
  INTEGRATION_TIKTOK_SYNC: 'integration.tiktok.sync',

  // Granulares da integração Shopee (esqueleto — ver docs/integrations/shopee.md). SYNC ainda
  // não é usada por nenhum endpoint (nenhum job de sincronização existe ainda), mas já reservada
  // pra manter a mesma granularidade da TikTok assim que a sincronização for implementada.
  INTEGRATION_SHOPEE_READ: 'integration.shopee.read',
  INTEGRATION_SHOPEE_CONNECT: 'integration.shopee.connect',
  INTEGRATION_SHOPEE_SYNC: 'integration.shopee.sync',

  INTEGRATION_INVENTORY_COMPARE: 'integration.inventory.compare',
  INTEGRATION_INVENTORY_PUSH: 'integration.inventory.push',

  INTEGRATION_JOBS_READ: 'integration.jobs.read',
  INTEGRATION_JOBS_RETRY: 'integration.jobs.retry',

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
    PERMISSIONS.INTEGRATION_TIKTOK_READ,
    PERMISSIONS.INTEGRATION_TIKTOK_CONNECT,
    PERMISSIONS.INTEGRATION_TIKTOK_SYNC,
    PERMISSIONS.INTEGRATION_SHOPEE_READ,
    PERMISSIONS.INTEGRATION_SHOPEE_CONNECT,
    PERMISSIONS.INTEGRATION_SHOPEE_SYNC,
    PERMISSIONS.INTEGRATION_INVENTORY_COMPARE,
    PERMISSIONS.INTEGRATION_INVENTORY_PUSH,
    PERMISSIONS.INTEGRATION_JOBS_READ,
    PERMISSIONS.INTEGRATION_JOBS_RETRY,
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
    PERMISSIONS.INTEGRATION_TIKTOK_READ,
    PERMISSIONS.INTEGRATION_SHOPEE_READ,
    PERMISSIONS.INTEGRATION_INVENTORY_COMPARE,
    PERMISSIONS.INTEGRATION_JOBS_READ,
  ],
  VIEWER: [
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.FINANCE_READ,
    PERMISSIONS.FISCAL_READ,
    PERMISSIONS.INTEGRATION_READ,
    PERMISSIONS.INTEGRATION_TIKTOK_READ,
    PERMISSIONS.INTEGRATION_SHOPEE_READ,
    PERMISSIONS.REPORT_READ,
  ],
};
