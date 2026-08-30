import type {
  ExternalOrder,
  ExternalOrderItem,
  ExternalProduct,
  ExternalReturn,
  ExternalStatement,
  ExternalTransaction,
} from '../index';

/**
 * Único ponto de conversão "payload TikTok -> DTO normalizado" (seção 2 do pedido). Nenhum
 * service de domínio deve ler um campo bruto da TikTok diretamente — tudo passa por aqui.
 * Os nomes de campo assumidos seguem docs/integrations/tiktok-data-mapping.md; como o Partner
 * Center não pôde ser inspecionado com uma conta real neste ambiente, esses nomes devem ser
 * reconciliados contra o payload real de sandbox antes do primeiro uso em produção — nunca
 * foram inventados sem base (seguem a nomenclatura pública documentada em outras integrações
 * TikTok Shop), mas também nunca são apresentados como 100% certos.
 */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function str(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return value === undefined || value === null ? undefined : String(value);
}

function requiredStr(obj: Record<string, unknown>, key: string): string {
  return str(obj, key) ?? '';
}

function unixDate(obj: Record<string, unknown>, key: string): Date | undefined {
  const value = obj[key];
  if (value === undefined || value === null || value === '') return undefined;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return new Date(seconds * 1000);
}

/**
 * Mapeamento status TikTok -> OrderStatus interno (seção 16 — única fonte de verdade, ver
 * docs/integrations/tiktok-data-mapping.md). Retorna `null` para um status externo desconhecido
 * em vez de adivinhar — o chamador nunca força uma transição a partir de um mapeamento incerto.
 */
const ORDER_STATUS_MAP: Record<string, string> = {
  UNPAID: 'CREATED',
  ON_HOLD: 'PAID',
  AWAITING_SHIPMENT: 'PAID',
  AWAITING_COLLECTION: 'PROCESSING',
  PARTIALLY_SHIPPING: 'READY_TO_SHIP',
  PACKAGE_READY_TO_SHIP: 'READY_TO_SHIP',
  IN_TRANSIT: 'SHIPPED',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  COMPLETED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  PARTIAL_RETURN: 'RETURN_REQUESTED',
  RETURN_APPLIED: 'RETURN_REQUESTED',
  IN_RETURN: 'RETURN_REQUESTED',
};

export function mapOrderStatus(externalStatus: string): string | null {
  return ORDER_STATUS_MAP[externalStatus.toUpperCase()] ?? null;
}

const TRANSACTION_TYPE_MAP: Record<string, string> = {
  order_amount: 'GROSS_SALE',
  seller_discount: 'SELLER_DISCOUNT',
  platform_discount: 'PLATFORM_DISCOUNT',
  platform_commission: 'PLATFORM_FEE',
  commission_fee: 'PLATFORM_FEE',
  shipping_fee_adjustment: 'SHIPPING_ADJUSTMENT',
  affiliate_commission: 'AFFILIATE_COMMISSION',
  payment: 'SETTLEMENT_PAYOUT',
  settlement: 'SETTLEMENT_PAYOUT',
};

/** Nunca inventa categoria — o que não é reconhecido cai em OTHER, valor bruto preservado. */
export function normalizeTransactionType(rawType: string): string {
  return TRANSACTION_TYPE_MAP[rawType] ?? 'OTHER';
}

export function normalizeOrder(raw: unknown): ExternalOrder {
  const order = asRecord(raw);
  const rawStatus = requiredStr(order, 'status');
  const mapped = mapOrderStatus(rawStatus);

  const items = Array.isArray(order.line_items) ? (order.line_items as unknown[]) : [];

  return {
    // Confirmado em produção: o campo real é `id` (igual ao produto — "id" no nível do recurso,
    // não "<recurso>_id"), não `order_id`. Com o nome errado, TODO pedido normalizava para
    // externalOrderId "" e colidia com o mesmo registro no banco — 226 pedidos buscados viravam
    // 226 "atualizações" do único pedido existente, nunca uma criação nova.
    externalOrderId: requiredStr(order, 'id') || requiredStr(order, 'order_id'),
    status: rawStatus,
    // Quando o status externo não é reconhecido, o chamador (OrdersService) preserva o
    // último status interno válido e registra `integrationIssue` — nunca adivinha aqui.
    internalStatus: mapped ?? '',
    customerName: str(order, 'buyer_name'),
    orderDate: unixDate(order, 'create_time') ?? new Date(),
    paidAt: unixDate(order, 'paid_time'),
    externalUpdatedAt: unixDate(order, 'update_time'),
    items: items.map(normalizeOrderItem),
    shippingRevenue: numericStr(asRecord(order.payment), 'shipping_fee'),
    shippingCost: numericStr(asRecord(order.payment), 'seller_shipping_fee'),
    marketplaceFee: numericStr(asRecord(order.payment), 'platform_fee'),
    raw,
  };
}

function normalizeOrderItem(raw: unknown): ExternalOrderItem {
  const item = asRecord(raw);
  return {
    externalSku: requiredStr(item, 'sku_id') || requiredStr(item, 'seller_sku'),
    quantity: Number(item.quantity ?? 1),
    unitPrice: numericStr(item, 'sale_price') ?? '0',
    sellerDiscount: numericStr(item, 'seller_discount'),
    platformDiscount: numericStr(item, 'platform_discount'),
  };
}

function numericStr(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : undefined;
}

/**
 * Um "produto" da TikTok pode ter várias SKUs (cor/tamanho) — cada uma vira um `ExternalProduct`
 * próprio (mesmo `externalProductId`, `externalSku`/preço/estoque individuais), igual ao nosso
 * modelo interno (1 Produto → N Variantes). Corrigido depois de confirmado em produção: a
 * versão anterior só processava `skus[0]`, descartando as demais variações silenciosamente.
 *
 * Confirmado contra o payload real (logado uma vez via debug temporário, já removido):
 * - O id do produto é o campo `id` no nível do produto — não `product_id`. Colide de propósito
 *   com o campo `id` de cada SKU (nível diferente, mesmo nome); usar o nome errado fazia
 *   `externalProductId` sair sempre vazio, quebrando o agrupamento de variações do mesmo produto.
 * - Preço é por SKU, em `skus[].price.tax_exclusive_price` (ou `.tax_inclusive_price`, quando a
 *   TikTok manda os dois — anúncio "Product API now supports two prices" do Partner Center) —
 *   nunca um campo `sale_price`/`amount` (isso é do item de pedido, schema diferente).
 */
export function normalizeProductSkus(raw: unknown): ExternalProduct[] {
  const product = asRecord(raw);
  const skus = Array.isArray(product.skus) ? (product.skus as unknown[]) : [];
  const externalProductId = requiredStr(product, 'id');
  const name = requiredStr(product, 'title') || requiredStr(product, 'product_name');

  if (skus.length === 0) {
    // Nunca visto em produção até agora, mas não deveria acontecer de verdade — mantém como
    // um único item em vez de descartar o produto inteiro silenciosamente.
    return [{ externalProductId, externalSku: externalProductId, name, price: '0', stock: 0, raw }];
  }

  return skus.map((rawSku) => {
    const sku = asRecord(rawSku);
    const inventoryList = Array.isArray(sku.inventory) ? (sku.inventory as unknown[]) : [];
    const stock = inventoryList.reduce((sum: number, entry) => sum + Number(asRecord(entry).quantity ?? 0), 0);
    const skuPrice = asRecord(sku.price);
    return {
      externalProductId,
      externalSku: requiredStr(sku, 'id'),
      name,
      price: numericStr(skuPrice, 'tax_inclusive_price') ?? numericStr(skuPrice, 'tax_exclusive_price') ?? '0',
      stock,
      raw: rawSku,
    };
  });
}

/** SKU do vendedor (seller_sku) — usado só para o match automático (seção 11), não persistido.
 * Recebe o `raw` de uma única SKU (não do produto inteiro — ver `normalizeProductSkus`).
 * A TikTok às vezes manda `seller_sku` como string vazia (campo presente, sem valor real) — trata
 * como ausente, senão vira um SKU inválido/duplicado em qualquer lugar que use este valor. */
export function extractSellerSku(rawSku: unknown): string | undefined {
  const sellerSku = str(asRecord(rawSku), 'seller_sku');
  return sellerSku ? sellerSku : undefined;
}

export function normalizeReturn(raw: unknown): ExternalReturn {
  const ret = asRecord(raw);
  return {
    externalOrderId: requiredStr(ret, 'order_id'),
    externalReturnId: requiredStr(ret, 'return_id'),
    status: requiredStr(ret, 'return_status'),
    reason: str(ret, 'return_reason'),
    raw,
  };
}

export function normalizeStatement(raw: unknown): ExternalStatement {
  const statement = asRecord(raw);
  return {
    externalStatementId: requiredStr(statement, 'statement_id'),
    periodStart: unixDate(statement, 'statement_time') ?? new Date(0),
    periodEnd: unixDate(statement, 'statement_time') ?? new Date(0),
    totalAmount: numericStr(statement, 'settlement_amount') ?? '0',
    status: requiredStr(statement, 'status'),
    raw,
  };
}

/**
 * `type` aqui é sempre a categoria BRUTA do canal (contrato genérico em `index.ts`) — a
 * normalização para categoria interna (`normalizeTransactionType`) é chamada explicitamente
 * pelo service de finance/settlement ao gravar `SettlementTransaction`, nunca aqui, para que
 * o valor bruto original (`rawType`) nunca se perca.
 */
export function normalizeTransaction(raw: unknown, statementId?: string): ExternalTransaction {
  const tx = asRecord(raw);
  return {
    externalTransactionId: requiredStr(tx, 'id') || requiredStr(tx, 'transaction_id'),
    externalOrderId: str(tx, 'order_id'),
    externalStatementId: statementId,
    type: requiredStr(tx, 'type') || requiredStr(tx, 'transaction_type'),
    amount: numericStr(tx, 'amount') ?? '0',
    occurredAt: unixDate(tx, 'create_time') ?? new Date(),
    raw,
  };
}
