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
    // `buyer_name` nunca apareceu preenchido em produção (confirmado: 100% dos pedidos
    // importados vieram com cliente "—") — a TikTok tipicamente mascara a identidade real do
    // comprador por privacidade. `recipient_address.name` (nome de quem recebe a entrega) é o
    // único identificador de pessoa que a API realmente expõe, e serve ao mesmo propósito
    // (saber "quem é" o cliente) — ainda não confirmado 100% contra o payload real desta loja.
    customerName: str(order, 'buyer_name') || str(asRecord(order.recipient_address), 'name'),
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
/**
 * Imagem principal do produto — nível do produto (`main_images`), não da SKU. CONFIRMADO em
 * produção (payload bruto logado): a resposta de "Search Products" (`products/search`, usada
 * para listar/sincronizar em massa) não traz NENHUM campo de imagem — só id, title, skus,
 * price, inventory, status. `main_images` só existe na resposta de "Get Product Detail"
 * (busca por id, uma chamada por produto — ver `getProductDetail` no connector), por isso a
 * imagem é buscada sob demanda (na criação/vínculo do produto), nunca durante a listagem em
 * massa. `urls`/`thumb_urls` já são URLs http(s) prontas (o `uri` sozinho é só um id interno da
 * TikTok, não uma URL) — ainda não confirmado contra um payload real de "Get Product Detail"
 * desta loja, por isso o log de debug temporário em `getProductDetail`. Sempre retorna a URL
 * remota da própria TikTok — nunca baixamos/guardamos o arquivo, só a referência.
 */
export function extractMainImageUrl(product: Record<string, unknown>): string | undefined {
  const images = Array.isArray(product.main_images) ? (product.main_images as unknown[]) : [];
  const first = asRecord(images[0]);
  const urls = Array.isArray(first.urls) ? (first.urls as unknown[]) : [];
  const thumbUrls = Array.isArray(first.thumb_urls) ? (first.thumb_urls as unknown[]) : [];
  const url = urls[0] ?? thumbUrls[0];
  return typeof url === 'string' && url ? url : undefined;
}

/** Descrição do produto (só disponível em "Get Product", nunca em "Search Products") — usada
 * para deixar o cadastro interno já populado, de olho em futuramente reenviar o cadastro para
 * outras plataformas. Best-effort: campo ausente ou vazio nunca deve travar o sync. */
export function extractDescription(product: Record<string, unknown>): string | undefined {
  const value = product.description;
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export function normalizeProductSkus(raw: unknown): ExternalProduct[] {
  const product = asRecord(raw);
  const skus = Array.isArray(product.skus) ? (product.skus as unknown[]) : [];
  const externalProductId = requiredStr(product, 'id');
  const name = requiredStr(product, 'title') || requiredStr(product, 'product_name');
  // "Search Products" nunca traz imagem NEM atributos de SKU (cor/tamanho) — confirmado em
  // produção (payload bruto logado, sem main_images e sem sales_attributes em nenhuma SKU). Os
  // dois só existem em "Get Product" (detalhe por id) e são buscados sob demanda via
  // `getProductDetail`, nunca aqui.
  const imageUrl = extractMainImageUrl(product);

  if (skus.length === 0) {
    // Nunca visto em produção até agora, mas não deveria acontecer de verdade — mantém como
    // um único item em vez de descartar o produto inteiro silenciosamente.
    return [{ externalProductId, externalSku: externalProductId, name, price: '0', stock: 0, imageUrl, raw }];
  }

  return skus.map((rawSku) => {
    const sku = asRecord(rawSku);
    const inventoryList = Array.isArray(sku.inventory) ? (sku.inventory as unknown[]) : [];
    const stock = inventoryList.reduce((sum: number, entry) => sum + Number(asRecord(entry).quantity ?? 0), 0);
    const skuPrice = asRecord(sku.price);
    const { color, size, imageUrl: skuImageUrl } = extractSkuAttributes(sku);
    return {
      externalProductId,
      externalSku: requiredStr(sku, 'id'),
      name,
      price: numericStr(skuPrice, 'tax_inclusive_price') ?? numericStr(skuPrice, 'tax_exclusive_price') ?? '0',
      stock,
      // Prefere a foto da própria SKU (por cor) — cai pra foto de capa do produto só quando a
      // SKU não tem uma própria (ex.: produto com uma cor só).
      imageUrl: skuImageUrl ?? imageUrl,
      color,
      size,
      raw: rawSku,
    };
  });
}

/** Extrai a URL de uma foto de `sku_img` — formato interno exato NÃO confirmado (só a EXISTÊNCIA
 * do campo foi confirmada em produção, ver comentário de `extractSkuAttributes`), então trata
 * defensivamente as formas mais prováveis: string direta, ou objeto no mesmo formato de
 * `main_images` (`urls[0]`/`thumb_urls[0]`), ou `{ url }`/`{ uri }` simples. Nunca inventa —
 * formato não reconhecido vira `undefined`, nunca lança erro (best-effort, mesmo espírito do
 * resto do mapper). */
function extractSkuImageUrl(rawImg: unknown): string | undefined {
  if (typeof rawImg === 'string') return rawImg || undefined;
  const img = asRecord(rawImg);
  const urls = Array.isArray(img.urls) ? (img.urls as unknown[]) : [];
  const thumbUrls = Array.isArray(img.thumb_urls) ? (img.thumb_urls as unknown[]) : [];
  const candidate = urls[0] ?? thumbUrls[0] ?? img.url ?? img.uri;
  return typeof candidate === 'string' && candidate ? candidate : undefined;
}

/**
 * Cor/tamanho/foto da SKU. CONFIRMADO em produção que "Search Products" não traz
 * `sales_attributes` em nenhuma SKU — só existe em "Get Product" (detalhe por id, ver
 * `getProductDetail` no connector), por isso esta função só é chamada a partir de lá. Estrutura
 * real confirmada por payload de produção: `sales_attributes: [{ name, value_name, value_id,
 * sku_img, id }]` — o nome do atributo é `name` (ex.: "Cor"), não `attribute_name` (chute
 * anterior, nunca existiu). `sku_img` vem junto do atributo de COR especificamente (a foto
 * representa a variação de cor, nunca a de tamanho) — por isso só é lida do atributo já
 * reconhecido como cor. Nunca inventa — atributo não reconhecido (nem "cor" nem "tamanho") fica
 * de fora, e `sku_img` ausente/em formato não reconhecido vira `undefined` (fallback pra foto de
 * capa do produto fica a cargo de quem consome isso).
 */
export function extractSkuAttributes(sku: Record<string, unknown>): { color?: string; size?: string; imageUrl?: string } {
  const attributes = Array.isArray(sku.sales_attributes) ? (sku.sales_attributes as unknown[]) : [];
  let color: string | undefined;
  let size: string | undefined;
  let imageUrl: string | undefined;
  for (const rawAttr of attributes) {
    const attr = asRecord(rawAttr);
    // Confirmado em produção (payload real de "Get Product"): o campo é `name` ("Cor"), não
    // `attribute_name` (chute anterior, nunca existiu) — `value_name` já estava certo.
    const attributeName = str(attr, 'name')?.toLowerCase() ?? '';
    const valueName = str(attr, 'value_name');
    if (!valueName) continue;
    if (attributeName.includes('cor') || attributeName.includes('color')) {
      color = valueName;
      imageUrl = extractSkuImageUrl(attr.sku_img);
    } else if (attributeName.includes('tamanho') || attributeName.includes('size')) {
      size = valueName;
    }
  }
  return { color, size, imageUrl };
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

/**
 * CONFIRMADO em produção (payload real, via `check-settlements` CLI): o campo é `id` no nível do
 * recurso (nunca `statement_id`, que provavelmente nunca existiu) — resolve o sintoma antigo de
 * `externalStatementId` vazio (87 statements colidindo num único registro no upsert).
 *
 * Também CONFIRMADO: não existe campo `status` no payload — o card "A receber" do dashboard
 * (soma de extratos ainda não repassados) ficava sempre contando um valor inflado porque todo
 * extrato caía no fallback PENDING. O campo real de liquidação é `payment_status` (visto com
 * valor `"PAID"` no payload real), companheiro de `payment_id`/`payment_time`.
 */
export function normalizeStatement(raw: unknown): ExternalStatement {
  const statement = asRecord(raw);
  const externalStatementId = requiredStr(statement, 'id') || requiredStr(statement, 'statement_id');
  return {
    externalStatementId,
    periodStart: unixDate(statement, 'statement_time') ?? new Date(0),
    periodEnd: unixDate(statement, 'statement_time') ?? new Date(0),
    totalAmount: numericStr(statement, 'settlement_amount') ?? '0',
    status: requiredStr(statement, 'payment_status'),
    raw,
  };
}

/**
 * `type` aqui é sempre a categoria BRUTA do canal (contrato genérico em `index.ts`) — a
 * normalização para categoria interna (`normalizeTransactionType`) é chamada explicitamente
 * pelo service de finance/settlement ao gravar `SettlementTransaction`, nunca aqui, para que
 * o valor bruto original (`rawType`) nunca se perca.
 *
 * CONFIRMADO em produção (payload real): esta API não devolve "uma transação por categoria"
 * como um livro-razão genérico (uma linha de venda, outra de taxa, outra de desconto) — devolve
 * um resumo financeiro COMPLETO de UM pedido por linha, `type` sempre `"ORDER"`, com dezenas de
 * campos nomeados (`gross_sales_amount`, `platform_commission_amount`, `fee_amount`,
 * `seller_discount_amount`, `settlement_amount`, ...) em vez de um `amount` genérico. `fee_amount`
 * é a taxa TOTAL cobrada pela plataforma nesse pedido (comissão + demais taxas somadas) — o valor
 * que efetivamente serve para "Taxas da plataforma". Tipos de transação ainda não vistos
 * (reembolso, ajuste...) podem ter outro formato — por isso o fallback para `amount` genérico.
 */
export function normalizeTransaction(raw: unknown, statementId?: string): ExternalTransaction {
  const tx = asRecord(raw);
  return {
    externalTransactionId: requiredStr(tx, 'id') || requiredStr(tx, 'transaction_id'),
    externalOrderId: str(tx, 'order_id'),
    externalStatementId: statementId,
    type: requiredStr(tx, 'type') || requiredStr(tx, 'transaction_type'),
    amount: numericStr(tx, 'fee_amount') ?? numericStr(tx, 'amount') ?? '0',
    // Transação tipo "ORDER" não tem `create_time` — só `order_create_time`.
    occurredAt: unixDate(tx, 'create_time') ?? unixDate(tx, 'order_create_time') ?? new Date(),
    raw,
  };
}
