/**
 * Contrato para conectores de marketplace (seção 45). Nenhum conector real é implementado
 * nesta fase — apenas a interface fortemente tipada que TikTok Shop, Shopee e Mercado Livre
 * irão implementar em etapas futuras. O domínio interno nunca depende diretamente do payload
 * de um marketplace específico: todo dado que entra passa por um DTO normalizado daqui.
 */

export type MarketplaceProvider = 'TIKTOK_SHOP' | 'SHOPEE' | 'MERCADO_LIVRE';

export interface IntegrationHealth {
  provider: MarketplaceProvider;
  connected: boolean;
  storeName?: string;
  lastSyncAt?: Date;
  lastError?: string;
}

export interface PageParams {
  pageSize?: number;
  pageToken?: string;
}

export interface Page<T> {
  items: T[];
  nextPageToken?: string;
}

export interface ProductSyncParams extends PageParams {
  updatedAfter?: Date;
}

export interface ExternalProduct {
  externalProductId: string;
  externalSku: string;
  name: string;
  price: string;
  stock: number;
  /** URL da imagem principal do produto no canal externo — sempre uma URL remota (nunca um
   * arquivo baixado/salvo localmente: o servidor nunca deve depender de um diretório local para
   * imagens de produto). `undefined` quando o canal não informa nenhuma imagem. */
  imageUrl?: string;
  raw: unknown;
}

export type ExternalProductPage = Page<ExternalProduct>;

export interface OrderSyncParams extends PageParams {
  /** Filtra por última atualização — correto para reconciliação periódica incremental (só o que
   * mudou desde o checkpoint). Nunca serve para uma carga histórica: um pedido antigo, entregue
   * e nunca mais tocado, tem update_time antigo mesmo se create_time for recente o bastante. */
  updatedAfter?: Date;
  /** Filtra por data de criação — usar para carga histórica/backfill explícito ("Pedidos desde"),
   * nunca para reconciliação incremental (senão reprocessaria o histórico inteiro a cada rodada). */
  createdAfter?: Date;
  status?: string;
}

export interface ExternalOrderItem {
  externalSku: string;
  quantity: number;
  unitPrice: string;
  sellerDiscount?: string;
  platformDiscount?: string;
}

/**
 * Pedido já normalizado pelo mapper do conector. `status` é sempre o texto bruto do canal
 * (preservado para depuração); `internalStatus` já é o resultado do mapeamento documentado em
 * `docs/integrations/tiktok-data-mapping.md` — nenhum service de domínio decide esse mapeamento
 * sozinho. `externalUpdatedAt`, quando o canal fornece, permite descartar atualizações fora de
 * ordem (um evento antigo chegando depois de um mais recente já aplicado).
 */
export interface ExternalOrder {
  externalOrderId: string;
  status: string;
  internalStatus: string;
  customerName?: string;
  orderDate: Date;
  paidAt?: Date;
  externalUpdatedAt?: Date;
  items: ExternalOrderItem[];
  shippingRevenue?: string;
  shippingCost?: string;
  marketplaceFee?: string;
  raw: unknown;
}

export type ExternalOrderPage = Page<ExternalOrder>;

export interface InventorySyncParams extends PageParams {
  externalSkus?: string[];
}

export interface ExternalInventory {
  externalSku: string;
  available: number;
}

export interface InventoryUpdate {
  externalSku: string;
  available: number;
}

export interface ReturnSyncParams extends PageParams {
  updatedAfter?: Date;
}

export interface ExternalReturn {
  externalOrderId: string;
  externalReturnId: string;
  status: string;
  reason?: string;
  raw: unknown;
}

export type ExternalReturnPage = Page<ExternalReturn>;

export interface TransactionSyncParams extends PageParams {
  periodStart?: Date;
  periodEnd?: Date;
  /** Restringe a busca às transações de um statement específico (fluxo Finance API — seção 30). */
  statementId?: string;
  /** Restringe a busca às transações de um pedido específico. */
  orderId?: string;
}

export interface ExternalTransaction {
  externalTransactionId: string;
  externalOrderId?: string;
  externalStatementId?: string;
  /** Categoria bruta do canal — a normalização para categoria interna acontece no mapper. */
  type: string;
  amount: string;
  occurredAt: Date;
  raw: unknown;
}

export type ExternalTransactionPage = Page<ExternalTransaction>;

/** Statement financeiro (seção 30-31) — agrupa transações liquidadas em um período. */
export interface ExternalStatement {
  externalStatementId: string;
  periodStart: Date;
  periodEnd: Date;
  totalAmount: string;
  status: string;
  raw: unknown;
}

export type ExternalStatementPage = Page<ExternalStatement>;

/**
 * Todo conector real (TikTok Shop, Shopee, Mercado Livre) implementa esta interface.
 * Nenhum método aqui é implementado nesta fase — ver docs/integrations/tiktok.md para o
 * plano de implementação do primeiro conector real.
 */
export interface MarketplaceConnector {
  provider: MarketplaceProvider;
  healthCheck(companyId: string): Promise<IntegrationHealth>;
  getProducts(companyId: string, params: ProductSyncParams): Promise<ExternalProductPage>;
  getOrders(companyId: string, params: OrderSyncParams): Promise<ExternalOrderPage>;
  getOrder(companyId: string, externalOrderId: string): Promise<ExternalOrder>;
  getInventory(companyId: string, params: InventorySyncParams): Promise<ExternalInventory[]>;
  updateInventory(companyId: string, updates: InventoryUpdate[]): Promise<void>;
  getReturns(companyId: string, params: ReturnSyncParams): Promise<ExternalReturnPage>;
  getStatements(companyId: string, params: PageParams & { updatedAfter?: Date }): Promise<ExternalStatementPage>;
  getTransactions(companyId: string, params: TransactionSyncParams): Promise<ExternalTransactionPage>;
}

/**
 * A TikTok Shop (Fase 3) já tem um conector real — `TikTokConnector`, exportado de `./tiktok`
 * — mas ele não é registrado aqui porque cada instância precisa das credenciais OAuth de uma
 * empresa específica, obtidas em runtime pelo backend (ver
 * apps/api/src/integrations/tiktok/tiktok-connector.factory.ts). Este array continua vazio de
 * propósito para conectores que não dependem de credenciais por empresa; Shopee e Mercado
 * Livre ainda não têm conector real.
 */
export const AVAILABLE_CONNECTORS: MarketplaceConnector[] = [];

export * from './tiktok';
