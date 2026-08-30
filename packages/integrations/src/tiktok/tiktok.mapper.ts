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
    externalOrderId: requiredStr(order, 'order_id'),
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

export function normalizeProduct(raw: unknown): ExternalProduct {
  const product = asRecord(raw);
  const skus = Array.isArray(product.skus) ? (product.skus as unknown[]) : [];
  const firstSku = asRecord(skus[0]);
  const inventoryList = Array.isArray(firstSku.inventory) ? (firstSku.inventory as unknown[]) : [];
  const stock = inventoryList.reduce((sum: number, entry) => sum + Number(asRecord(entry).quantity ?? 0), 0);

  return {
    externalProductId: requiredStr(product, 'product_id'),
    externalSku: requiredStr(firstSku, 'id'),
    name: requiredStr(product, 'product_name') || requiredStr(product, 'title'),
    price: numericStr(asRecord(product.price), 'sale_price') ?? '0',
    stock,
    raw,
  };
}

/** SKU do vendedor (seller_sku) — usado só para o match automático (seção 11), não persistido.
 * A TikTok às vezes manda `seller_sku` como string vazia (campo presente, sem valor real) — trata
 * como ausente, senão vira um SKU inválido/duplicado em qualquer lugar que use este valor. */
export function extractSellerSku(rawProduct: unknown): string | undefined {
  const product = asRecord(rawProduct);
  const skus = Array.isArray(product.skus) ? (product.skus as unknown[]) : [];
  const sellerSku = str(asRecord(skus[0]), 'seller_sku');
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
