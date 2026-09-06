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
  // Nunca passa pela fila BullMQ (ao contrário dos demais acima) — publicação/atualização
  // automática de produto roda direto no ciclo síncrono do agendador
  // (`TikTokProductsSyncSchedulerService`), mesmo padrão do Mercado Livre
  // (`MERCADO_LIVRE_JOBS.PUBLISH_PRODUCT_COLOR`/`_DESCRIPTION`). Usado só como `type` de
  // rastreamento no `SyncJob`, pra alimentar a tela de Jobs/Falhas. DIFERENÇA IMPORTANTE do
  // Mercado Livre: lá cada variante (cor) vira um item separado, então `relatedExternalId` é o
  // `variantId`; aqui um produto inteiro (com todas as variantes como SKUs) vira UMA chamada só,
  // então `relatedExternalId` é o `productId`, nunca um variantId.
  PUBLISH_PRODUCT: 'tiktok-publish-product',
} as const;

export type IntegrationJobName = (typeof INTEGRATION_JOBS)[keyof typeof INTEGRATION_JOBS];
