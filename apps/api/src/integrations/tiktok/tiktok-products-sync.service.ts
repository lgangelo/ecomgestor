import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ChannelMappingSyncStatus, Prisma, ProductStatus, VariantStatus } from '@ecommerce-manager/database';
import { extractSellerSku, type ExternalProduct } from '@ecommerce-manager/integrations';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { AuditService } from '../../audit/audit.service';
import { InventoryLedgerService } from '../../inventory/ledger.service';
import { ProductsService } from '../../products/products.service';
import { TikTokConnectorFactory } from './tiktok-connector.factory';
import { TikTokCredentialsService } from './tiktok-credentials.service';

const MAX_PAGES = 20;

export interface UnmatchedTikTokProduct {
  externalProductId: string;
  externalSku: string;
  sellerSku?: string;
  name: string;
  price: string;
  stock: number;
  imageUrl?: string;
  color?: string;
  size?: string;
  suggestedVariantId?: string;
  suggestedSku?: string;
  ambiguous: boolean;
}

/**
 * Produtos TikTok não vinculados (seção 10-11-12 da Fase 3). O match automático só é
 * SUGERIDO aqui — nunca efetivado sozinho quando há mais de um candidato (REVIEW_REQUIRED),
 * e mesmo quando há exatamente um candidato o vínculo em `channel_product_mappings` só é
 * gravado como CONFIRMED por uma ação explícita do usuário (`linkToVariant`).
 */
@Injectable()
export class TikTokProductsSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentialsService: TikTokCredentialsService,
    private readonly connectorFactory: TikTokConnectorFactory,
    private readonly audit: AuditService,
    private readonly ledger: InventoryLedgerService,
    private readonly productsService: ProductsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext('TikTokProductsSync');
  }

  /** Busca o catálogo inteiro da TikTok (todas as páginas) — reusado tanto para achar produtos
   * não vinculados quanto para sincronizar os que já têm vínculo confirmado. */
  private async fetchAllExternalProducts(companyId: string): Promise<ExternalProduct[]> {
    const { connector } = await this.connectorFactory.forCompany(companyId);
    const all: ExternalProduct[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await connector.getProducts(companyId, { pageSize: 50, pageToken });
      all.push(...result.items);
      if (!result.nextPageToken) break;
      pageToken = result.nextPageToken;
    }
    return all;
  }

  async listUnmatched(companyId: string): Promise<UnmatchedTikTokProduct[]> {
    const integration = await this.credentialsService.requireIntegration(companyId);
    if (!integration.channelId) return [];

    const existingMappings = await this.prisma.client.channelProductMapping.findMany({
      where: { channelId: integration.channelId },
    });
    const mappedSkus = new Set(existingMappings.map((m) => m.externalSku).filter(Boolean));

    const variants = await this.prisma.client.productVariant.findMany({
      where: { product: { companyId } },
      select: { id: true, sku: true },
    });
    const variantBySku = new Map<string, string[]>();
    for (const variant of variants) {
      const list = variantBySku.get(variant.sku) ?? [];
      list.push(variant.id);
      variantBySku.set(variant.sku, list);
    }

    const externalProducts = await this.fetchAllExternalProducts(companyId);
    const unmatched: UnmatchedTikTokProduct[] = [];
    for (const product of externalProducts) {
      if (mappedSkus.has(product.externalSku)) continue;
      const sellerSku = extractSellerSku(product.raw);
      const candidates = sellerSku ? (variantBySku.get(sellerSku) ?? []) : [];
      unmatched.push({
        externalProductId: product.externalProductId,
        externalSku: product.externalSku,
        sellerSku,
        name: product.name,
        price: product.price,
        stock: product.stock,
        imageUrl: product.imageUrl,
        color: product.color,
        size: product.size,
        suggestedVariantId: candidates.length === 1 ? candidates[0] : undefined,
        suggestedSku: candidates.length === 1 ? sellerSku : undefined,
        ambiguous: candidates.length > 1,
      });
    }

    return unmatched;
  }

  /**
   * Disparado pelo job em segundo plano (seção 9-51) — nunca recomputado/persistido além do
   * checkpoint: a lista de não-vinculados continua sempre calculada ao vivo em `listUnmatched`
   * (mais correto que cache, já que estoque/catálogo mudam constantemente do lado da TikTok).
   * Este método existe para validar a conectividade em segundo plano e alimentar o checkpoint
   * exibido no painel de saúde (seção 8/28), sem bloquear o request HTTP que disparou a importação.
   *
   * Também dispara `syncLinkedProducts` (preço/estoque/imagem dos produtos já vinculados) —
   * antes disso só rodava com um clique manual separado na aba de Produtos da integração, o que
   * confundia o operador ("rodei a sincronização e nada mudou"). Roda melhor-esforço: uma falha
   * aqui nunca derruba a checagem de não-vinculados nem o checkpoint, mas fica registrada no log
   * e no resultado do job (tela de Jobs) em vez de desaparecer em silêncio.
   */
  async runProductsCheck(
    companyId: string,
  ): Promise<{ unmatchedCount: number; linkedSync?: Awaited<ReturnType<TikTokProductsSyncService['syncLinkedProducts']>>; linkedSyncError?: string }> {
    const integration = await this.credentialsService.requireIntegration(companyId);
    const unmatched = await this.listUnmatched(companyId);

    let linkedSync: Awaited<ReturnType<typeof this.syncLinkedProducts>> | undefined;
    let linkedSyncError: string | undefined;
    try {
      linkedSync = await this.syncLinkedProducts(companyId, null);
    } catch (error) {
      linkedSyncError = error instanceof Error ? error.message : 'Erro desconhecido';
      this.logger.warn('tiktok_linked_products_sync_failed', {
        operation: 'run_products_check',
        errorMessage: linkedSyncError,
      });
    }

    const checkpoints = (integration.syncCheckpoints as Record<string, string> | null) ?? {};
    await this.prisma.client.integration.update({
      where: { id: integration.id },
      data: { syncCheckpoints: { ...checkpoints, productsSyncAt: new Date().toISOString() } },
    });

    return { unmatchedCount: unmatched.length, linkedSync, linkedSyncError };
  }

  async link(
    companyId: string,
    userId: string,
    externalSku: string,
    externalProductId: string | undefined,
    variantId: string,
  ) {
    const integration = await this.credentialsService.requireIntegration(companyId);
    if (!integration.channelId) throw new BadRequestException('Canal TikTok Shop ainda não conectado');

    const variant = await this.prisma.client.productVariant.findFirst({
      where: { id: variantId, product: { companyId } },
    });
    if (!variant) throw new NotFoundException('Produto interno não encontrado');

    const mapping = await this.prisma.client.channelProductMapping.upsert({
      where: { channelId_externalSku: { channelId: integration.channelId, externalSku } },
      create: {
        channelId: integration.channelId,
        variantId,
        externalSku,
        externalProductId: externalProductId ?? null,
        syncStatus: ChannelMappingSyncStatus.CONFIRMED,
      },
      update: { variantId, syncStatus: ChannelMappingSyncStatus.CONFIRMED },
    });

    await this.audit.log({
      companyId,
      userId,
      action: 'TIKTOK_PRODUCT_LINKED',
      entity: 'channel_product_mapping',
      entityId: mapping.id,
      newValue: { externalSku, variantId },
    });

    return mapping;
  }

  async ignore(companyId: string, userId: string, externalSku: string, externalProductId?: string) {
    const integration = await this.credentialsService.requireIntegration(companyId);
    if (!integration.channelId) throw new BadRequestException('Canal TikTok Shop ainda não conectado');

    const mapping = await this.prisma.client.channelProductMapping.upsert({
      where: { channelId_externalSku: { channelId: integration.channelId, externalSku } },
      create: {
        channelId: integration.channelId,
        externalSku,
        externalProductId: externalProductId ?? null,
        syncStatus: ChannelMappingSyncStatus.IGNORED,
      },
      update: { syncStatus: ChannelMappingSyncStatus.IGNORED },
    });

    await this.audit.log({
      companyId,
      userId,
      action: 'TIKTOK_PRODUCT_IGNORED',
      entity: 'channel_product_mapping',
      entityId: mapping.id,
      newValue: { externalSku },
    });

    return mapping;
  }

  /** Acha o produto interno já criado a partir do MESMO produto TikTok (outra SKU/variação dele
   * já foi importada antes) — para a nova SKU virar mais uma variação, nunca um produto
   * duplicado. Um produto TikTok (`externalProductId`) deve sempre corresponder a exatamente um
   * produto interno, com uma variação por SKU. */
  private async findProductIdForExternalProduct(
    companyId: string,
    channelId: string,
    externalProductId: string,
  ): Promise<string | undefined> {
    const mapping = await this.prisma.client.channelProductMapping.findFirst({
      where: { channelId, externalProductId, variantId: { not: null } },
      include: { variant: { select: { productId: true, product: { select: { companyId: true } } } } },
    });
    if (mapping?.variant && mapping.variant.product.companyId === companyId) {
      return mapping.variant.productId;
    }
    return undefined;
  }

  /**
   * Cria (ou, se já existir um produto para o mesmo `externalProductId`, apenas adiciona uma
   * variação nele) a partir dos dados do produto TikTok (seção 10, ação "Criar produto
   * interno"). Se `stock` vier preenchido (> 0), já semeia o saldo inicial via
   * `InventoryLedgerService.adjust` — mesmo mecanismo usado por qualquer outra entrada/ajuste de
   * estoque no sistema (nunca escreve direto na tabela de saldo, sempre com movimentação
   * registrada), para a carga inicial já vir com estoque de verdade em vez de zerada.
   */
  async createInternalProduct(
    companyId: string,
    userId: string,
    externalSku: string,
    externalProductId: string | undefined,
    input: { name: string; sku: string; price: string; stock?: number; imageUrl?: string; color?: string; size?: string },
  ) {
    const integration = await this.credentialsService.requireIntegration(companyId);
    if (!integration.channelId) throw new BadRequestException('Canal TikTok Shop ainda não conectado');

    const existingProductId = externalProductId
      ? await this.findProductIdForExternalProduct(companyId, integration.channelId, externalProductId)
      : undefined;

    // "Search Products" (fonte de `input.imageUrl`/`input.color`/`input.size`) confirmadamente
    // não traz nenhum dos três nem a descrição — busca tudo sob demanda via "Get Product" (uma
    // única chamada resolve imagem + descrição + atributos de TODAS as SKUs do produto).
    // Melhor-esforço: nunca trava a criação se a busca falhar.
    let imageUrl = input.imageUrl;
    let color = input.color;
    let size = input.size;
    let description: string | undefined;
    // Foto POR VARIAÇÃO (cor) — CONFIRMADO em produção que "Get Product" traz `sku_img` junto do
    // atributo de cor de cada SKU (ver extractSkuAttributes), nunca usado até aqui: toda
    // variação herdava só a foto de capa do produto, mesmo tendo cor própria com foto própria.
    let variantImageUrl: string | undefined;
    if ((!imageUrl || (!color && !size)) && externalProductId) {
      try {
        const { connector } = await this.connectorFactory.forCompany(companyId);
        const detail = await connector.getProductDetail(companyId, externalProductId);
        imageUrl = imageUrl ?? detail.imageUrl;
        description = detail.description;
        const skuAttrs = detail.skus.find((s) => s.externalSku === externalSku);
        color = color ?? skuAttrs?.color;
        size = size ?? skuAttrs?.size;
        variantImageUrl = skuAttrs?.imageUrl;
      } catch {
        // best-effort — segue sem imagem/descrição/atributos.
      }
    }

    // Espelha as fotos (hospedadas no CDN da TikTok) pro nosso próprio armazenamento antes de
    // gravar — CONFIRMADO em produção: uma rede móvel bloqueando o domínio da TikTok fazia a
    // foto sumir só naquele aparelho, mesmo com a URL correta. A de capa do produto só quando o
    // produto é NOVO (a variação-em-produto-existente nunca grava capa, então mirrorar aqui seria
    // trabalho perdido) — a de variação sempre, já que toda variação nova grava sua própria foto,
    // nos dois ramos abaixo. Best-effort: se falhar (rede instável no momento da sincronização),
    // mantém a URL externa original — nunca bloqueia a criação do produto por causa disso.
    if (imageUrl && !existingProductId) {
      try {
        imageUrl = await this.productsService.mirrorExternalImage(companyId, imageUrl);
      } catch {
        // best-effort — mantém a URL externa original.
      }
    }
    if (variantImageUrl) {
      try {
        variantImageUrl = await this.productsService.mirrorExternalImage(companyId, variantImageUrl);
      } catch {
        // best-effort — mantém a URL externa original.
      }
    }

    let productId: string;
    let variantId: string;

    if (existingProductId) {
      const variant = await this.prisma.client.productVariant.create({
        data: {
          productId: existingProductId,
          sku: input.sku,
          suggestedPrice: input.price,
          color: color ?? null,
          size: size ?? null,
          imageUrl: variantImageUrl ?? null,
          status: VariantStatus.ACTIVE,
        },
      });
      productId = existingProductId;
      variantId = variant.id;
    } else {
      const product = await this.prisma.client.product.create({
        data: {
          companyId,
          name: input.name,
          description: description ?? null,
          baseSku: input.sku,
          imageUrl: imageUrl ?? null,
          status: ProductStatus.DRAFT,
          variants: {
            create: [
              {
                sku: input.sku,
                suggestedPrice: input.price,
                color: color ?? null,
                size: size ?? null,
                imageUrl: variantImageUrl ?? null,
                status: VariantStatus.ACTIVE,
              },
            ],
          },
        },
        include: { variants: true },
      });
      productId = product.id;
      variantId = product.variants[0].id;
    }

    const mapping = await this.link(companyId, userId, externalSku, externalProductId, variantId);

    if (input.stock && input.stock > 0) {
      await this.prisma.client.$transaction((tx) =>
        this.ledger.adjust(
          tx,
          {
            companyId,
            variantId,
            referenceType: 'tiktok_import',
            referenceId: externalSku,
            userId,
            reason: 'Carga inicial via TikTok Shop',
          },
          input.stock!,
        ),
      );
    }

    await this.audit.log({
      companyId,
      userId,
      action: 'TIKTOK_PRODUCT_CREATED',
      entity: 'product',
      entityId: productId,
      newValue: { externalSku, sku: input.sku, stock: input.stock ?? 0, addedAsVariant: Boolean(existingProductId) },
    });

    const product = await this.prisma.client.product.findUniqueOrThrow({
      where: { id: productId },
      include: { variants: true },
    });

    return { product, mapping };
  }

  /**
   * Criação em lote (seção 10, carga inicial — catálogos grandes tornam a criação item a item
   * inviável). Cada item é criado de forma independente: um SKU duplicado ou qualquer outro erro
   * num item nunca aborta os demais, só entra na lista de falhas para o operador corrigir depois
   * (o SKU pode ser ajustado a qualquer momento na tela de edição da variação).
   *
   * `sku` é opcional por item: sem SKU do vendedor informado pela TikTok, gera um placeholder
   * sequencial ("0001", "0002", ...) continuando do maior SKU puramente numérico já existente da
   * empresa — nunca reaproveita um número já usado, mesmo entre lotes diferentes.
   */
  async createInternalProductsBulk(
    companyId: string,
    userId: string,
    items: Array<{
      externalSku: string;
      externalProductId?: string;
      name: string;
      sku?: string;
      price: string;
      stock?: number;
      imageUrl?: string;
      color?: string;
      size?: string;
    }>,
  ): Promise<{ created: number; failed: Array<{ externalSku: string; error: string }> }> {
    const existingVariants = await this.prisma.client.productVariant.findMany({
      where: { product: { companyId } },
      select: { sku: true },
    });
    let placeholderCounter = existingVariants.reduce(
      (max, v) => (/^\d+$/.test(v.sku) ? Math.max(max, parseInt(v.sku, 10)) : max),
      0,
    );

    let created = 0;
    const failed: Array<{ externalSku: string; error: string }> = [];

    for (const item of items) {
      const sku = item.sku?.trim() ? item.sku.trim() : String(++placeholderCounter).padStart(4, '0');
      try {
        await this.createInternalProduct(companyId, userId, item.externalSku, item.externalProductId, {
          name: item.name,
          sku,
          price: item.price,
          stock: item.stock,
          imageUrl: item.imageUrl,
          color: item.color,
          size: item.size,
        });
        created++;
      } catch (error) {
        const message =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
            ? `Já existe um produto/variante com o SKU "${sku}"`
            : error instanceof Error
              ? error.message
              : 'Erro desconhecido';
        failed.push({ externalSku: item.externalSku, error: message });
      }
    }

    return { created, failed };
  }

  /**
   * Sincroniza (nunca cria) produtos já vinculados: atualiza preço e estoque a partir dos dados
   * atuais da TikTok, usando o SKU externo já gravado no vínculo (`channel_product_mapping`)
   * como chave de comparação — não depende de nome nem de posição, só do SKU. Só toca vínculos
   * CONFIRMED; nunca cria produto novo (isso é `createInternalProduct(sBulk)`, uma ação
   * separada e explícita). Cada item é atualizado de forma independente — um erro num item
   * (ex.: o estoque da TikTok agora é menor que o já reservado aqui) nunca aborta os demais.
   */
  async syncLinkedProducts(
    companyId: string,
    userId: string | null,
    // "Get Product" (imagem + atributos de SKU) é uma chamada extra por produto — sem limite, um
    // catálogo grande sem nada disso ainda faz o job demorar minutos numa única execução
    // (confirmado pelo usuário: "o job de importar produtos agora tá demorando mais"). O job de
    // rotina (chamado sem este parâmetro) usa o limite padrão de 20 por execução; produtos sem
    // nenhum atributo real (ex.: só "Cor", nunca "Tamanho") ficam para sempre "faltando" e
    // consomem o limite todo run após run sem nunca alcançar o resto do catálogo — por isso o
    // script de backfill único (`backfill-tiktok-product-details`) passa um limite bem maior
    // para conseguir varrer o catálogo inteiro de uma vez.
    detailFetchLimit = 20,
  ): Promise<{ updated: number; unchanged: number; notFoundOnTikTok: number; failed: Array<{ externalSku: string; error: string }> }> {
    const integration = await this.credentialsService.requireIntegration(companyId);
    if (!integration.channelId) throw new BadRequestException('Canal TikTok Shop ainda não conectado');

    const mappings = await this.prisma.client.channelProductMapping.findMany({
      where: { channelId: integration.channelId, syncStatus: ChannelMappingSyncStatus.CONFIRMED, variantId: { not: null } },
    });
    if (mappings.length === 0) {
      return { updated: 0, unchanged: 0, notFoundOnTikTok: 0, failed: [] };
    }

    const externalProducts = await this.fetchAllExternalProducts(companyId);
    const bySku = new Map(externalProducts.map((p) => [p.externalSku, p]));
    const { connector } = await this.connectorFactory.forCompany(companyId);

    let updated = 0;
    let unchanged = 0;
    let notFoundOnTikTok = 0;
    const failed: Array<{ externalSku: string; error: string }> = [];
    let detailFetchesThisRun = 0;

    for (const mapping of mappings) {
      const externalSku = mapping.externalSku ?? '';
      const externalProduct = externalSku ? bySku.get(externalSku) : undefined;
      if (!externalProduct || !mapping.variantId) {
        notFoundOnTikTok++;
        continue;
      }

      try {
        const variant = await this.prisma.client.productVariant.findUniqueOrThrow({
          where: { id: mapping.variantId },
          include: { inventory: true, product: { select: { id: true, imageUrl: true, description: true } } },
        });

        let changed = false;

        if (Number(variant.suggestedPrice) !== Number(externalProduct.price)) {
          await this.prisma.client.productVariant.update({
            where: { id: variant.id },
            data: { suggestedPrice: externalProduct.price },
          });
          changed = true;
        }

        // Produtos/variações criados antes destes campos serem extraídos (ou sem imagem/atributo/
        // descrição resolvidos na criação) nunca ganhavam isso depois — só preenche quando ainda
        // está vazio, nunca sobrescreve o que o operador já editou manualmente. Nenhum dos quatro
        // (imagem, cor, tamanho, descrição) vem de "Search Products" (confirmado para os 3
        // primeiros) — busca tudo junto sob demanda via "Get Product" quando falta algo,
        // best-effort (nunca aborta a sincronização do resto).
        const missingImage = !variant.product.imageUrl;
        const missingAttrs = !variant.color || !variant.size;
        const missingDescription = !variant.product.description;
        // Foto POR VARIAÇÃO (cor) — mesmo campo `sku_img` que a criação já usa (ver
        // createInternalProduct); produtos/variações sincronizados antes dessa mudança nunca
        // ganhavam isso, só a foto de capa do produto.
        const missingVariantImage = !variant.imageUrl;
        if (
          (missingImage || missingAttrs || missingDescription || missingVariantImage) &&
          mapping.externalProductId &&
          detailFetchesThisRun < detailFetchLimit
        ) {
          detailFetchesThisRun++;
          try {
            const detail = await connector.getProductDetail(companyId, mapping.externalProductId);
            if ((missingImage && detail.imageUrl) || (missingDescription && detail.description)) {
              // Mesmo espelhamento de `createInternalProduct` — nunca grava a URL externa da
              // TikTok direto, best-effort (mantém a URL externa original se falhar).
              let resolvedImageUrl = detail.imageUrl;
              if (missingImage && resolvedImageUrl) {
                try {
                  resolvedImageUrl = await this.productsService.mirrorExternalImage(companyId, resolvedImageUrl);
                } catch {
                  // best-effort — mantém a URL externa original.
                }
              }
              await this.prisma.client.product.update({
                where: { id: variant.product.id },
                data: {
                  ...(missingImage && resolvedImageUrl ? { imageUrl: resolvedImageUrl } : {}),
                  ...(missingDescription && detail.description ? { description: detail.description } : {}),
                },
              });
              changed = true;
            }
            if (missingAttrs || missingVariantImage) {
              const skuAttrs = detail.skus.find((s) => s.externalSku === externalSku);
              const variantAttrUpdate: { color?: string; size?: string; imageUrl?: string } = {};
              if (!variant.color && skuAttrs?.color) variantAttrUpdate.color = skuAttrs.color;
              if (!variant.size && skuAttrs?.size) variantAttrUpdate.size = skuAttrs.size;
              if (missingVariantImage && skuAttrs?.imageUrl) {
                // Mesmo espelhamento de sempre — nunca grava a URL externa da TikTok direto.
                try {
                  variantAttrUpdate.imageUrl = await this.productsService.mirrorExternalImage(companyId, skuAttrs.imageUrl);
                } catch {
                  // best-effort — tenta de novo na próxima sincronização.
                }
              }
              if (Object.keys(variantAttrUpdate).length > 0) {
                await this.prisma.client.productVariant.update({ where: { id: variant.id }, data: variantAttrUpdate });
                changed = true;
              }
            }
          } catch {
            // best-effort — segue sem imagem/atributos, tenta de novo na próxima sincronização.
          }
        }

        // `externalProduct.stock` é o campo que NÓS mesmos escrevemos na TikTok em
        // `updateInventory` (envia `available`, nunca `onHand`) — então ele representa estoque
        // DISPONÍVEL, não físico total. Comparar contra `onHand` direto (em vez de
        // `onHand - reserved`) fazia o ajuste falhar com "estoque disponível insuficiente"
        // sempre que havia reserva ativa (ex.: pedido aguardando envio) e a TikTok reportava um
        // número mais baixo — o ajuste tentava derrubar o físico abaixo do que já estava
        // reservado. Ajustar contra `available` mantém `reserved` intocado e corrige `onHand`
        // só o suficiente pra bater com o disponível reportado pela TikTok.
        //
        // CONFIRMADO em produção: o "disponível" que a TikTok reporta aqui já reflete pedidos
        // recém-enviados como VENDIDOS (ela baixa do lado dela assim que o pedido sai) — antes
        // do nosso lado ter tido a chance de aplicar essa MESMA baixa (`stockAppliedStatus`
        // atrasado em relação a `status`, ver `OrdersService.applyStockEffectsForTransition`).
        // Sem somar de volta essa quantidade ainda pendente, esta sincronização periódica
        // travava esse pedido pra sempre: zera o onHand pra bater com a TikTok, o catch-up
        // tenta baixar de novo (a MESMA unidade, contada duas vezes) e falha por saldo
        // insuficiente — na próxima sincronização de produtos, zera de novo, num ciclo infinito.
        const currentOnHand = variant.inventory?.onHand ?? 0;
        const currentReserved = variant.inventory?.reserved ?? 0;
        const currentAvailable = currentOnHand - currentReserved;
        const pendingCatchUpQty = await this.pendingStockCatchUpQty(variant.id);
        const delta = externalProduct.stock + pendingCatchUpQty - currentAvailable;
        if (delta !== 0) {
          await this.prisma.client.$transaction((tx) =>
            this.ledger.adjust(
              tx,
              {
                companyId,
                variantId: variant.id,
                referenceType: 'tiktok_sync',
                referenceId: externalSku,
                userId,
                reason: 'Sincronização com TikTok Shop',
              },
              delta,
            ),
          );
          changed = true;
        }

        if (changed) updated++;
        else unchanged++;
      } catch (error) {
        failed.push({ externalSku, error: error instanceof Error ? error.message : 'Erro desconhecido' });
      }
    }

    await this.audit.log({
      companyId,
      userId,
      action: 'TIKTOK_PRODUCTS_SYNCED',
      entity: 'channel_product_mapping',
      newValue: { updated, unchanged, notFoundOnTikTok, failedCount: failed.length },
    });

    return { updated, unchanged, notFoundOnTikTok, failed };
  }

  /** Soma a quantidade de pedidos com baixa de estoque ainda pendente (`status` avançou mas
   * `stockAppliedStatus` ficou pra trás — ver `OrdersService.applyStockEffectsForTransition`)
   * para uma variação. Usado para nunca deixar a sincronização de estoque com a TikTok "roubar"
   * de volta uma unidade que um pedido local ainda precisa debitar. */
  private async pendingStockCatchUpQty(variantId: string): Promise<number> {
    // Comparar duas colunas da MESMA linha (`status` vs `stockAppliedStatus`) não dá pra
    // filtrar direto no Prisma — mesmo critério já usado em `computeAttention` (reports.service.ts)
    // para `onHand - reserved`: busca os candidatos e compara em memória.
    const items = await this.prisma.client.orderItem.findMany({
      where: { variantId },
      select: { quantity: true, order: { select: { status: true, stockAppliedStatus: true } } },
    });
    return items.filter((i) => i.order.status !== i.order.stockAppliedStatus).reduce((sum, i) => sum + i.quantity, 0);
  }
}
