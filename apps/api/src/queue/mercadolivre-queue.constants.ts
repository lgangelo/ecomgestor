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
} as const;

export type MercadoLivreJobName = (typeof MERCADO_LIVRE_JOBS)[keyof typeof MERCADO_LIVRE_JOBS];
