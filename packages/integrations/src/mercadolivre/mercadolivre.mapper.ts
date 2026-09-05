import type { ExternalOrder, ExternalOrderItem } from '../index';
import type { MercadoLivreOrder, MercadoLivreOrderItem } from './mercadolivre.types';

/**
 * Único ponto de conversão "payload Mercado Livre -> DTO normalizado" (mesmo papel de
 * `tiktok.mapper.ts`). Nenhum service de domínio deve ler um campo bruto do Mercado Livre
 * diretamente — tudo passa por aqui.
 */

/**
 * Mapeamento status Mercado Livre -> OrderStatus interno. Só `"cancelled"` foi confirmado contra
 * uma chamada real em produção (ver docs/integrations/mercado-livre.md, seção 4) — qualquer outro
 * valor retorna `null` em vez de adivinhar, deixando o `OrdersService` cair no fallback genérico
 * (assume `CREATED` + marca `integrationSyncStatus: ERROR` para revisão manual, mesmo tratamento
 * já usado pela TikTok). Nunca adicionar um valor aqui sem ver de verdade numa resposta real.
 */
const ORDER_STATUS_MAP: Record<string, string> = {
  cancelled: 'CANCELLED',
};

export function mapMercadoLivreOrderStatus(externalStatus: string): string | null {
  return ORDER_STATUS_MAP[externalStatus.toLowerCase()] ?? null;
}

export function normalizeMercadoLivreOrder(order: MercadoLivreOrder): ExternalOrder {
  const mapped = mapMercadoLivreOrderStatus(order.status);
  const firstPayment = order.payments?.[0];

  return {
    externalOrderId: String(order.id),
    status: order.status,
    // Status desconhecido: o chamador (OrdersService) preserva o último status interno válido e
    // registra `integrationIssue` — nunca adivinha aqui.
    internalStatus: mapped ?? '',
    customerName:
      order.buyer?.first_name || order.buyer?.last_name
        ? [order.buyer.first_name, order.buyer.last_name].filter(Boolean).join(' ')
        : order.buyer?.nickname,
    orderDate: new Date(order.date_created),
    paidAt: firstPayment?.date_approved ? new Date(firstPayment.date_approved) : undefined,
    externalUpdatedAt: new Date(order.last_updated),
    items: (order.order_items ?? []).map(normalizeMercadoLivreOrderItem),
    // Custo/receita de frete moram em `GET /shipments/{id}`, fora do escopo desta v1 — nunca
    // inventar um valor a partir de `order.shipping_cost` (confirmado sempre `null` no pedido em
    // si, o valor real fica só no recurso de envio separado).
    shippingRevenue: undefined,
    shippingCost: undefined,
    marketplaceFee: sumSaleFees(order.order_items),
    raw: order,
  };
}

function normalizeMercadoLivreOrderItem(item: MercadoLivreOrderItem): ExternalOrderItem {
  return {
    // CONFIRMADO presente, mas ver a ressalva em `mercadolivre.types.ts` sobre `seller_sku` não
    // bater necessariamente com o SKU interno enviado na criação do item (pedidos antigos, de
    // antes do atributo `SELLER_SKU` ser enviado, trazem um valor sintetizado pelo próprio
    // Mercado Livre). Quando `seller_sku` não vem, o fallback PRECISA incluir `variation_id`
    // quando existir — usar só `item.id` faria duas variações (cores) do MESMO anúncio colidirem
    // no mesmo `externalSku` (a constraint `@@unique([channelId, externalSku])` deixaria uma das
    // duas variações resolvendo pra variante interna ERRADA, incluindo baixa de estoque no lugar
    // físico errado). O próprio Mercado Livre sintetiza o `seller_sku` real nesse formato
    // (`{item_id}_{variation_id}`, visto no único pedido real confirmado) — replicamos o mesmo
    // formato aqui só quando ele mesmo não preenche.
    externalSku: item.item.seller_sku || (item.item.variation_id ? `${item.item.id}_${item.item.variation_id}` : item.item.id),
    quantity: item.quantity,
    unitPrice: item.unit_price.toFixed(2),
    // Desconto de vendedor/plataforma não foram vistos no único pedido real disponível até
    // agora — nunca inventar um campo que não apareceu de verdade.
    sellerDiscount: undefined,
    platformDiscount: undefined,
  };
}

/** Soma de `order_items[].sale_fee` — única fonte confirmada da comissão do Mercado Livre (ver
 * correção documentada em docs/integrations/mercado-livre.md, seção 4: `payments[].marketplace_fee`
 * veio zerado no único pagamento visto, `sale_fee` por item é o valor real). */
function sumSaleFees(items: MercadoLivreOrderItem[] | undefined): string | undefined {
  if (!items || items.length === 0) return undefined;
  const total = items.reduce((sum, item) => sum + (item.sale_fee ?? 0), 0);
  return total.toFixed(2);
}
