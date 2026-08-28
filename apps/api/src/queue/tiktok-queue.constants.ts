/**
 * Fila nomeada "integration" (seção 51 da Fase 2 — finalmente implementada na Fase 3): agrupa
 * todo trabalho assíncrono de integração TikTok Shop, separado da fila "housekeeping" já
 * existente, para que falhas de integração nunca compitam por prioridade com manutenção
 * interna nem sejam confundidas na tela de falhas (seção 27).
 */
export const INTEGRATION_QUEUE = 'integration';

export const INTEGRATION_JOBS = {
  IMPORT_PRODUCTS: 'tiktok-import-products',
  IMPORT_ORDERS: 'tiktok-import-orders',
  PROCESS_WEBHOOK: 'tiktok-process-webhook',
  RECONCILE_ORDERS: 'tiktok-reconcile-orders',
  SYNC_FINANCE: 'tiktok-sync-finance',
  SYNC_RETURNS: 'tiktok-sync-returns',
  PUSH_INVENTORY: 'tiktok-push-inventory',
} as const;

export type IntegrationJobName = (typeof INTEGRATION_JOBS)[keyof typeof INTEGRATION_JOBS];
