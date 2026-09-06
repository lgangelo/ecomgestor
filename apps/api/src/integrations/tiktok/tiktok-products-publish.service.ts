import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelMappingSyncStatus, ChannelType } from '@ecommerce-manager/database';
import {
  TikTokApiError,
  TikTokCategoryAttribute,
  TikTokCreateProductInput,
  TikTokCreateProductSku,
} from '@ecommerce-manager/integrations';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { INTEGRATION_JOBS } from '../../queue/tiktok-queue.constants';
import { TikTokConnectorFactory } from './tiktok-connector.factory';
import { TikTokCredentialsService } from './tiktok-credentials.service';

// Teto de produtos processados por ciclo — mesma razão do Mercado Livre (MAX_PRODUCTS_PER_CYCLE
// em mercadolivre-products-sync.service.ts): a primeira publicação de um produto custa várias
// chamadas de API (upload de cada imagem + Get Attributes + Create Product); nunca travar um
// ciclo inteiro.
const MAX_PRODUCTS_PER_CYCLE = 50;

interface ProductForPublish {
  id: string;
  name: string;
  description: string | null;
  status: string;
  baseSku: string;
  categoryId: string | null;
  imageUrl: string | null;
  images: Array<{ url: string; position: number }>;
  variants: Array<{
    id: string;
    sku: string;
    color: string | null;
    size: string | null;
    status: string;
    suggestedPrice: unknown;
    imageUrl: string | null;
    inventory: { onHand: number; reserved: number } | null;
  }>;
}

/**
 * Publicação/atualização automática de produto na TikTok Shop — pedido do usuário: produtos
 * nascem só na nossa plataforma e são publicados/atualizados automaticamente quando ficam
 * ACTIVE, mesmo papel de `MercadoLivreProductsSyncService`, mas adaptado ao modelo de dados bem
 * mais simples da TikTok: UM produto (`product_id`) carrega TODAS as variações como `skus[]` numa
 * chamada só — nunca precisa da ginástica de `family_name`/"item por cor" que o Mercado Livre
 * exige (modelo "User Products").
 *
 * NÃO CONFIRMADO NADA AINDA contra uma chamada real de criação nesta conta — todo método aqui é
 * best-effort a partir da documentação oficial (ver docs/integrations/tiktok.md, seção nova). O
 * kill switch (`tiktok.productsSyncEnabled`) nasce DESLIGADO por isso — ao contrário do Mercado
 * Livre, que já tinha sido confirmado antes de ligar por padrão.
 */
@Injectable()
export class TikTokProductsPublishService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly credentialsService: TikTokCredentialsService,
    private readonly connectorFactory: TikTokConnectorFactory,
    private readonly audit: AuditService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext('TikTokProductsPublishService');
  }

  isEnabled(): boolean {
    return Boolean(this.configService.get<boolean>('tiktok.productsSyncEnabled', { infer: true }));
  }

  private async fetchProducts(companyId: string): Promise<ProductForPublish[]> {
    const rows = await this.prisma.client.product.findMany({
      where: { companyId, status: 'ACTIVE' },
      take: MAX_PRODUCTS_PER_CYCLE,
      include: {
        images: { orderBy: { position: 'asc' } },
        variants: { include: { inventory: true }, orderBy: { createdAt: 'asc' } },
      },
    });

    return rows.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      status: product.status,
      baseSku: product.baseSku,
      categoryId: product.categoryId,
      imageUrl: product.imageUrl,
      images: product.images.map((i) => ({ url: i.url, position: i.position })),
      variants: product.variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        color: variant.color,
        size: variant.size,
        status: variant.status,
        suggestedPrice: variant.suggestedPrice,
        imageUrl: variant.imageUrl,
        inventory: variant.inventory ? { onHand: variant.inventory.onHand, reserved: variant.inventory.reserved } : null,
      })),
    }));
  }

  private available(variant: ProductForPublish['variants'][number]): number {
    if (!variant.inventory) return 0;
    return Math.max(variant.inventory.onHand - variant.inventory.reserved, 0);
  }

  /** Baixa uma imagem já hospedada (R2 ou disco local, servida pela nossa própria API) pra poder
   * reenviar como arquivo — a TikTok Shop, ao contrário do Mercado Livre, NUNCA aceita uma URL
   * externa direto (ver docs/integrations/tiktok.md): "You will not be able to use any image URLs
   * that are not hosted by TikTok Shop." Precisa baixar e re-upload pra cada imagem. */
  private async fetchImageBuffer(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Falha ao baixar imagem "${url}" (HTTP ${response.status})`);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /** ACHADO REAL: "Get Warehouse List" exige o escopo `seller.logistics`, que o app não tem
   * ("Access denied" confirmado contra a conta real) — enquanto o escopo não é liberado no
   * Partner Center, usa o `warehouse_id` real que o usuário informou direto (visível no painel
   * do vendedor), configurado via `TIKTOK_DEFAULT_WAREHOUSE_ID`. Só tenta a API quando esse valor
   * não está configurado (útil se/quando o escopo for liberado, sem precisar de outro deploy) —
   * formato de resposta NÃO CONFIRMADO nesse caso (a doc oficial não mostrou um exemplo completo),
   * então tenta os formatos mais prováveis (array direto, ou sob uma chave `warehouses`/
   * `warehouse_list`), cada item com `warehouse_id` ou `id`. Se nada bater, falha alto e claro
   * (nunca inventa um id). NÃO CONFIRMADO ainda qual devolver quando há mais de um armazém — hoje
   * pega sempre o primeiro da lista quando cai nesse caminho. */
  private async resolveWarehouseId(connector: Awaited<ReturnType<TikTokConnectorFactory['forCompany']>>['connector']): Promise<string> {
    const configured = this.configService.get<string | null>('tiktok.defaultWarehouseId', { infer: true });
    if (configured) return configured;

    const raw = (await connector.getWarehouses()) as Record<string, unknown>;
    const list = Array.isArray(raw)
      ? (raw as unknown[])
      : Array.isArray(raw?.warehouses)
        ? (raw.warehouses as unknown[])
        : Array.isArray(raw?.warehouse_list)
          ? (raw.warehouse_list as unknown[])
          : [];
    const first = list[0] as Record<string, unknown> | undefined;
    const id = first?.warehouse_id ?? first?.id;
    if (!id) {
      throw new UnprocessableEntityException(
        'Não foi possível descobrir o warehouse_id — formato de resposta do Get Warehouse List não reconhecido. Rode check-tiktok-warehouses e ajuste TikTokProductsPublishService.resolveWarehouseId com o formato real.',
      );
    }
    return String(id);
  }

  /** Acha o atributo de "cor" e de "tamanho" na ficha da categoria por NOME (case-insensitive,
   * português ou inglês) — NÃO CONFIRMADO contra uma categoria real ainda (o nome exato do
   * atributo varia por categoria, igual no Mercado Livre). Categoria sem um desses atributos
   * simplesmente não recebe aquele `sales_attribute` (produto sem variação de cor/tamanho). */
  private resolveVariationAttributes(attrs: TikTokCategoryAttribute[]): {
    color?: TikTokCategoryAttribute;
    size?: TikTokCategoryAttribute;
  } {
    return {
      color: attrs.find((a) => /cor|colou?r/i.test(a.name)),
      size: attrs.find((a) => /tamanho|size/i.test(a.name)),
    };
  }

  /** Resolve o `sales_attributes[]` de UMA variante pro atributo de cor/tamanho da categoria —
   * `isCustomizable` (achado real da doc: existe nesta API, diferente do Mercado Livre que nunca
   * aceita valor fora do catálogo fechado) deixa mandar `name`/`value_name` livre sem precisar
   * bater com um catálogo fechado; só quando NÃO é customizável precisa achar o `value_id` exato
   * (mesmo problema de sinônimo que já resolvemos pro Mercado Livre, ainda sem solução aqui). */
  private resolveSalesAttributeValue(
    attribute: TikTokCategoryAttribute | undefined,
    rawValue: string | null,
  ): { id: string; value_id?: string; name?: string; value_name?: string } | undefined {
    if (!attribute || !rawValue) return undefined;
    if (attribute.isCustomizable) {
      return { id: attribute.id, name: attribute.name, value_name: rawValue };
    }
    const match = attribute.values?.find((v) => v.name.toLowerCase() === rawValue.toLowerCase());
    if (!match) return undefined;
    return { id: attribute.id, value_id: match.id };
  }

  private async recordPublishFailure(integrationId: string, productId: string, errorMessage: string): Promise<void> {
    const existing = await this.prisma.client.syncJob.findFirst({
      where: { integrationId, type: INTEGRATION_JOBS.PUBLISH_PRODUCT, relatedExternalId: productId },
    });
    const data = {
      status: 'FAILED' as const,
      error: errorMessage,
      errorCategory: 'VALIDATION',
      payload: { productId },
      finishedAt: new Date(),
    };
    if (existing) {
      await this.prisma.client.syncJob.update({ where: { id: existing.id }, data: { ...data, attempts: existing.attempts + 1 } });
      return;
    }
    await this.prisma.client.syncJob.create({
      data: { integrationId, type: INTEGRATION_JOBS.PUBLISH_PRODUCT, relatedExternalId: productId, attempts: 1, maxAttempts: 1, ...data },
    });
  }

  private async clearPublishFailure(integrationId: string, productId: string): Promise<void> {
    await this.prisma.client.syncJob.deleteMany({
      where: { integrationId, type: INTEGRATION_JOBS.PUBLISH_PRODUCT, relatedExternalId: productId },
    });
  }

  /** Monta o payload completo de `createProduct` pra UM produto (resolve categoria, armazém,
   * atributos de cor/tamanho, faz upload de todas as imagens de verdade) — nunca chama
   * `createProduct` (isso fica a cargo de quem chama: `publishEligible`, no ciclo automático, ou
   * `buildProductPayload`, no dry-run manual). Caches (`warehouseId`/`attrsByCategory`) são
   * compartilhados entre produtos do MESMO ciclo/chamada, pra nunca buscar de novo à toa. */
  private async buildCreateProductPayload(
    product: ProductForPublish,
    eligibleVariants: ProductForPublish['variants'],
    connector: Awaited<ReturnType<TikTokConnectorFactory['forCompany']>>['connector'],
    caches: { warehouseId?: string; attrsByCategory: Map<string, TikTokCategoryAttribute[]> },
  ): Promise<TikTokCreateProductInput> {
    if (!product.categoryId) {
      throw new UnprocessableEntityException('Produto sem categoria cadastrada — não é possível descobrir a categoria da TikTok Shop.');
    }
    const categoryMapping = await this.prisma.client.categoryChannelMapping.findUnique({
      where: { categoryId_channelType: { categoryId: product.categoryId, channelType: ChannelType.TIKTOK_SHOP } },
    });
    if (!categoryMapping) {
      throw new UnprocessableEntityException(
        `Categoria do produto sem mapeamento pra TikTok Shop configurado — rode set-category-channel-mapping pra categoria ${product.categoryId}.`,
      );
    }

    // ACHADO REAL em investigação: erro de shop_cipher aparece em algum ponto deste método sem
    // stack trace útil (CLI só imprime err.message) — breadcrumb temporário pra localizar com
    // certeza qual chamada é (getCategoryAttributes vs upload de imagem), em vez de adivinhar de
    // novo. Remover depois de confirmado.
    this.logger.log('tiktok_publish_debug_step', { step: 'antes_resolve_warehouse', productId: product.id });
    if (!caches.warehouseId) caches.warehouseId = await this.resolveWarehouseId(connector);
    const warehouseId = caches.warehouseId;

    this.logger.log('tiktok_publish_debug_step', { step: 'antes_get_category_attributes', productId: product.id, categoryId: categoryMapping.externalCategoryId });
    let attrs = caches.attrsByCategory.get(categoryMapping.externalCategoryId);
    if (!attrs) {
      attrs = await connector.getCategoryAttributes(
        categoryMapping.externalCategoryId,
        categoryMapping.externalCategoryVersion as 'v1' | 'v2' | undefined,
      );
      caches.attrsByCategory.set(categoryMapping.externalCategoryId, attrs);
    }
    this.logger.log('tiktok_publish_debug_step', { step: 'depois_get_category_attributes', productId: product.id });
    const { color: colorAttr, size: sizeAttr } = this.resolveVariationAttributes(attrs);

    const mainImageUrls = [product.imageUrl, ...product.images.map((i) => i.url)].filter(
      (url): url is string => url != null && /^https?:\/\//.test(url),
    );
    const mainImages: Array<{ uri: string }> = [];
    for (const url of Array.from(new Set(mainImageUrls))) {
      this.logger.log('tiktok_publish_debug_step', { step: 'antes_upload_main_image', productId: product.id, url });
      const buffer = await this.fetchImageBuffer(url);
      const uploaded = await connector.uploadImage(buffer, url.split('/').pop() ?? 'capa.jpg', 'MAIN_IMAGE');
      this.logger.log('tiktok_publish_debug_step', { step: 'depois_upload_main_image', productId: product.id, url });
      mainImages.push({ uri: uploaded.uri });
    }

    // sku_img só pode ficar em UM tipo de atributo (o "principal", cor) — uma imagem por
    // valor distinto, nunca repetida por SKU (achado da doc oficial).
    const skuImageByColor = new Map<string, { uri: string }>();

    const skus: TikTokCreateProductSku[] = [];
    for (const variant of eligibleVariants) {
      const sales_attributes = [];
      const colorValue = this.resolveSalesAttributeValue(colorAttr, variant.color);
      if (variant.color && colorAttr && !colorValue) {
        throw new UnprocessableEntityException(`Cor "${variant.color}" não encontrada na lista de valores do atributo "${colorAttr.name}" desta categoria.`);
      }
      if (colorValue) {
        if (variant.color && variant.imageUrl && !skuImageByColor.has(variant.color) && /^https?:\/\//.test(variant.imageUrl)) {
          this.logger.log('tiktok_publish_debug_step', { step: 'antes_upload_attribute_image', productId: product.id, color: variant.color });
          const buffer = await this.fetchImageBuffer(variant.imageUrl);
          const uploaded = await connector.uploadImage(buffer, variant.imageUrl.split('/').pop() ?? 'cor.jpg', 'ATTRIBUTE_IMAGE');
          this.logger.log('tiktok_publish_debug_step', { step: 'depois_upload_attribute_image', productId: product.id, color: variant.color });
          skuImageByColor.set(variant.color, { uri: uploaded.uri });
        }
        sales_attributes.push({ ...colorValue, ...(variant.color && skuImageByColor.has(variant.color) ? { sku_img: skuImageByColor.get(variant.color) } : {}) });
      }
      const sizeValue = this.resolveSalesAttributeValue(sizeAttr, variant.size);
      if (variant.size && sizeAttr && !sizeValue) {
        throw new UnprocessableEntityException(`Tamanho "${variant.size}" não encontrado na lista de valores do atributo "${sizeAttr.name}" desta categoria.`);
      }
      if (sizeValue) sales_attributes.push(sizeValue);

      skus.push({
        ...(sales_attributes.length ? { sales_attributes } : {}),
        inventory: [{ warehouse_id: warehouseId, quantity: this.available(variant) }],
        price: { amount: String(variant.suggestedPrice), currency: 'BRL' },
        seller_sku: variant.sku,
      });
    }

    return {
      title: product.name.length > 255 ? product.name.slice(0, 255) : product.name,
      description: product.description ?? product.name,
      category_id: categoryMapping.externalCategoryId,
      ...(categoryMapping.externalCategoryVersion ? { category_version: categoryMapping.externalCategoryVersion as 'v1' | 'v2' } : {}),
      main_images: mainImages,
      skus,
    };
  }

  /** DRY-RUN manual (pedido do usuário, antes de ligar o ciclo automático pra todo o catálogo):
   * monta o payload de UM produto de verdade (faz upload real das imagens — só não cria o
   * produto) e devolve pra revisão, sem nunca chamar `createProduct`. Usado pelo CLI de
   * diagnóstico `check-tiktok-publish-dry-run`. Produto precisa estar ACTIVE com pelo menos 1
   * variante ainda não publicada (mesma regra de elegibilidade de `publishEligible`). */
  async buildProductPayload(companyId: string, productId: string): Promise<TikTokCreateProductInput> {
    const integration = await this.credentialsService.requireIntegration(companyId);
    if (!integration.channelId) throw new NotFoundException('Canal TikTok Shop ainda não conectado.');
    const channelId = integration.channelId;

    const products = await this.fetchProducts(companyId);
    const product = products.find((p) => p.id === productId);
    if (!product) throw new NotFoundException('Produto não encontrado, ou não está ACTIVE.');

    const existingMappings = await this.prisma.client.channelProductMapping.findMany({
      where: { channelId, variantId: { in: product.variants.map((v) => v.id) } },
      select: { variantId: true },
    });
    const alreadyPublished = new Set(existingMappings.map((m) => m.variantId));
    const eligibleVariants = product.variants.filter((v) => v.status === 'ACTIVE' && !alreadyPublished.has(v.id));
    if (eligibleVariants.length === 0) {
      throw new UnprocessableEntityException('Nenhuma variante elegível — todas já publicadas na TikTok Shop, ou nenhuma ACTIVE.');
    }

    const { connector } = await this.connectorFactory.forCompany(companyId);
    return this.buildCreateProductPayload(product, eligibleVariants, connector, { attrsByCategory: new Map() });
  }

  /** Publica todo produto ACTIVE ainda sem vínculo TikTok Shop (nenhuma variante mapeada) — uma
   * chamada de `createProduct` por produto, com TODAS as variações como `skus[]`. */
  async publishEligible(companyId: string): Promise<{ published: number; failed: number; skipped: number }> {
    const integration = await this.credentialsService.requireIntegration(companyId);
    if (!integration.channelId) return { published: 0, failed: 0, skipped: 0 };
    const channelId = integration.channelId;

    const products = await this.fetchProducts(companyId);
    if (products.length === 0) return { published: 0, failed: 0, skipped: 0 };

    const existingMappings = await this.prisma.client.channelProductMapping.findMany({
      where: { channelId, variantId: { in: products.flatMap((p) => p.variants.map((v) => v.id)) } },
      select: { variantId: true },
    });
    const alreadyPublishedVariantIds = new Set(existingMappings.map((m) => m.variantId));

    const { connector } = await this.connectorFactory.forCompany(companyId);

    let published = 0;
    let failed = 0;
    let skipped = 0;
    // Cache por ciclo — nunca busca de novo pro mesmo warehouse/categoria dentro do mesmo lote.
    const caches: { warehouseId?: string; attrsByCategory: Map<string, TikTokCategoryAttribute[]> } = { attrsByCategory: new Map() };

    for (const product of products) {
      const eligibleVariants = product.variants.filter((v) => v.status === 'ACTIVE' && !alreadyPublishedVariantIds.has(v.id));
      if (eligibleVariants.length === 0) {
        skipped++;
        continue;
      }

      try {
        const payload = await this.buildCreateProductPayload(product, eligibleVariants, connector, caches);
        const created = await connector.createProduct(payload);
        const externalProductId = String((created as Record<string, unknown>).product_id ?? '');
        if (!externalProductId) {
          throw new UnprocessableEntityException('Create Product não devolveu product_id — formato de resposta não reconhecido.');
        }

        for (const variant of eligibleVariants) {
          await this.prisma.client.channelProductMapping.upsert({
            where: { channelId_variantId: { channelId, variantId: variant.id } },
            create: { channelId, variantId: variant.id, externalProductId, externalSku: variant.sku, syncStatus: ChannelMappingSyncStatus.CONFIRMED },
            update: { externalProductId, externalSku: variant.sku, syncStatus: ChannelMappingSyncStatus.CONFIRMED },
          });
        }
        await this.clearPublishFailure(integration.id, product.id);
        await this.audit.log({
          companyId,
          userId: null,
          action: 'TIKTOK_PRODUCT_PUBLISHED',
          entity: 'channel_product_mapping',
          entityId: product.id,
          newValue: { externalProductId },
        });
        published++;
      } catch (error) {
        failed++;
        const message = error instanceof TikTokApiError ? error.message : error instanceof Error ? error.message : String(error);
        this.logger.error('tiktok_publish_failed', { operation: 'publish_eligible', productId: product.id, errorMessage: message });
        await this.recordPublishFailure(integration.id, product.id, message);
      }
    }

    if (published > 0 || failed > 0) {
      this.logger.log('tiktok_products_published', { operation: 'publish_eligible', published, failed, skipped });
    }
    return { published, failed, skipped };
  }
}
