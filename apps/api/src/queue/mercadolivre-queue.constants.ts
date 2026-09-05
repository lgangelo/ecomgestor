/**
 * Fila própria `mercadolivre` — DE PROPÓSITO separada da fila `integration` (usada pela TikTok).
 * O único `Worker` já existente na fila `integration` despacha por um `switch(job.name)` fechado
 * (`TikTokWorkerService`); um segundo `Worker` escutando a MESMA fila roubaria jobs da TikTok
 * aleatoriamente, já que o BullMQ distribui trabalho por fila, não por nome de job — cairiam no
 * `default: log unknown_job` do worker errado. Isolamento total evita esse risco, ao custo de uma
 * conexão Redis + `Worker` a mais por processo (mesmo padrão dos módulos de scheduler já
 * existentes, ver `tiktok-stock-outbox-scheduler.module.ts`).
 */
export const MERCADO_LIVRE_QUEUE = 'mercadolivre';

export const MERCADO_LIVRE_JOBS = {
  IMPORT_ORDERS: 'mercadolivre-import-orders',
  RECONCILE_ORDERS: 'mercadolivre-reconcile-orders',
  // Nunca passa pela fila BullMQ (ao contrário dos dois acima) — publicação de produto roda direto
  // no ciclo síncrono do agendador (`MercadoLivreProductsSyncSchedulerService`). Usado só como
  // `type` de rastreamento no `SyncJob`, pra alimentar a tela de Jobs/Falhas com o motivo real de
  // uma cor não ter sido publicada (ex.: "cor não encontrada no catálogo") e permitir tentar de
  // novo manualmente depois de corrigir o dado — pedido explícito do usuário.
  PUBLISH_PRODUCT_COLOR: 'mercadolivre-publish-product-color',
} as const;

export type MercadoLivreJobName = (typeof MERCADO_LIVRE_JOBS)[keyof typeof MERCADO_LIVRE_JOBS];
