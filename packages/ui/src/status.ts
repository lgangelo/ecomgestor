/**
 * Mapeamento central de status -> rótulo (pt-BR) e variante visual de badge.
 * Mantido fora do app Next.js para reuso caso surjam outros clientes no futuro.
 */
export type BadgeTone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

export interface StatusPresentation {
  label: string;
  tone: BadgeTone;
}

export const ORDER_STATUS_PRESENTATION: Record<string, StatusPresentation> = {
  CREATED: { label: 'Criado', tone: 'muted' },
  PAID: { label: 'Pago', tone: 'info' },
  PROCESSING: { label: 'Em processamento', tone: 'info' },
  READY_TO_SHIP: { label: 'Pronto para envio', tone: 'info' },
  SHIPPED: { label: 'Enviado', tone: 'info' },
  DELIVERED: { label: 'Entregue', tone: 'success' },
  CANCELLED: { label: 'Cancelado', tone: 'danger' },
  RETURN_REQUESTED: { label: 'Devolução solicitada', tone: 'warning' },
  RETURNED: { label: 'Devolvido', tone: 'warning' },
  REFUNDED: { label: 'Reembolsado', tone: 'danger' },
  PARTIALLY_REFUNDED: { label: 'Reembolsado parcialmente', tone: 'warning' },
};

export const PRODUCT_STATUS_PRESENTATION: Record<string, StatusPresentation> = {
  ACTIVE: { label: 'Ativo', tone: 'success' },
  INACTIVE: { label: 'Inativo', tone: 'muted' },
  DRAFT: { label: 'Rascunho', tone: 'warning' },
};

export const VARIANT_STATUS_PRESENTATION: Record<string, StatusPresentation> = {
  ACTIVE: { label: 'Ativo', tone: 'success' },
  INACTIVE: { label: 'Inativo', tone: 'muted' },
};

export const INVENTORY_MOVEMENT_PRESENTATION: Record<string, StatusPresentation> = {
  PURCHASE: { label: 'Compra', tone: 'success' },
  SALE: { label: 'Venda', tone: 'info' },
  RETURN: { label: 'Devolução', tone: 'warning' },
  CANCELLATION: { label: 'Cancelamento', tone: 'muted' },
  ADJUSTMENT: { label: 'Ajuste', tone: 'info' },
  DAMAGE: { label: 'Avaria', tone: 'danger' },
  LOSS: { label: 'Perda', tone: 'danger' },
  RESERVATION: { label: 'Reserva', tone: 'muted' },
  RELEASE: { label: 'Liberação', tone: 'muted' },
};

export const INTEGRATION_STATUS_PRESENTATION: Record<string, StatusPresentation> = {
  CONNECTED: { label: 'Conectado', tone: 'success' },
  DISCONNECTED: { label: 'Desconectado', tone: 'muted' },
  DEGRADED: { label: 'Degradado', tone: 'warning' },
  AUTH_EXPIRED: { label: 'Autorização expirada', tone: 'danger' },
  ERROR: { label: 'Erro', tone: 'danger' },
  COMING_SOON: { label: 'Em breve', tone: 'muted' },
};

/** Estados de área individual do painel de saúde da TikTok Shop (seção 8/55 da Fase 3). */
export const TIKTOK_AREA_STATUS_PRESENTATION: Record<string, StatusPresentation> = {
  OK: { label: 'OK', tone: 'success' },
  STALE: { label: 'Sem sincronizar', tone: 'warning' },
  DEGRADED: { label: 'Degradado', tone: 'danger' },
  DISCONNECTED: { label: 'Desconectado', tone: 'muted' },
  AUTH_EXPIRED: { label: 'Autorização expirada', tone: 'danger' },
  CONFORME_DISPONIBILIDADE: { label: 'Conforme disponibilidade', tone: 'info' },
};

export const FISCAL_DOCUMENT_STATUS_PRESENTATION: Record<string, StatusPresentation> = {
  PENDING: { label: 'Pendente', tone: 'warning' },
  ISSUED: { label: 'Emitido', tone: 'success' },
  CANCELLED: { label: 'Cancelado', tone: 'danger' },
  ERROR: { label: 'Erro', tone: 'danger' },
};

export const STOCK_ENTRY_STATUS_PRESENTATION: Record<string, StatusPresentation> = {
  DRAFT: { label: 'Rascunho', tone: 'muted' },
  CONFIRMED: { label: 'Confirmada', tone: 'success' },
  CANCELLED: { label: 'Cancelada', tone: 'danger' },
};

export const RETURN_STATUS_PRESENTATION: Record<string, StatusPresentation> = {
  REQUESTED: { label: 'Solicitada', tone: 'warning' },
  APPROVED: { label: 'Aprovada', tone: 'info' },
  REJECTED: { label: 'Rejeitada', tone: 'danger' },
  RECEIVED: { label: 'Recebida', tone: 'info' },
  COMPLETED: { label: 'Concluída', tone: 'success' },
};

export const MONTHLY_CLOSING_STATUS_PRESENTATION: Record<string, StatusPresentation> = {
  OPEN: { label: 'Em aberto', tone: 'warning' },
  CLOSED: { label: 'Fechado', tone: 'success' },
};
