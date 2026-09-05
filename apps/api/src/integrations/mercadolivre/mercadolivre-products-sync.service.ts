import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelMappingSyncStatus } from '@ecommerce-manager/database';
import { MercadoLivreApiError, MercadoLivreCreateItemInput, MercadoLivreCreatedItem } from '@ecommerce-manager/integrations';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { MercadoLivreConnectorFactory } from './mercadolivre-connector.factory';
import { MercadoLivreCredentialsService } from './mercadolivre-credentials.service';

const SITE_ID = 'MLB';
const CURRENCY_ID = 'BRL';
const BRAND_FALLBACK_NAME = 'Generic';
// Mesma preferência confirmada em produção pelos scripts manuais (publish-mercadolivre-item.ts) —
// sempre confirmada contra a lista real da conta antes de usar, nunca hard-codada sozinha.
const PREFERRED_LISTING_TYPE_ID = 'gold_special';
// Teto de produtos processados por ciclo — a primeira publicação de um item custa várias chamadas
// de API (predictCategory + getCategoryAttributes + createItem + setItemDescription); nunca travar
// um ciclo inteiro nem estourar o rate limit estimado (~1500 req/min, não confirmado — ver
// docs/integrations/mercado-livre.md).
const MAX_PRODUCTS_PER_CYCLE = 50;

interface ProductForSync {
  id: string;
  name: string;
  description: string | null;
  status: string;
  baseSku: string;
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

type MappingRow = { variantId: string | null; externalProductId: string | null; syncStatus: ChannelMappingSyncStatus };

/**
 * Publicação/atualização automática de catálogo no Mercado Livre (Bloco 3) — outbound, papel
 * análogo a `MercadoLivreInventorySyncService` mas de CATÁLOGO, não de estoque. Nunca toca em
 * `available_quantity` — isso já é responsabilidade separada do outbox de estoque (Bloco 2);
 * duplicar aqui criaria dois caminhos escrevendo a mesma coisa no mesmo item.
 *
 * Reaproveita a mesma lógica/payload já confirmada em produção pelos scripts manuais
 * (`apps/api/src/cli/publish-mercadolivre-item.ts`/`add-mercadolivre-variations.ts`), generalizada
 * pra rodar sozinha: cada cor de um produto é um item próprio (`POST /items`) compartilhando o
 * mesmo `family_name` (modelo "User Products" do Mercado Livre — nunca `variations[]`, incompatível
 * com `family_name`, erro real já confirmado).
 */
@Injectable()
export class MercadoLivreProductsSyncService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly credentialsService: MercadoLivreCredentialsService,
    private readonly connectorFactory: MercadoLivreConnectorFactory,
    private readonly audit: AuditService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext('MercadoLivreProductsSync');
  }

  isEnabled(): boolean {
    return Boolean(this.configService.get<boolean>('mercadoLivre.productsSyncEnabled', { infer: true }));
  }

  private priceMarkupPercent(): number {
    return this.configService.get<number>('mercadoLivre.priceMarkupPercent', { infer: true }) ?? 0;
  }

  private publishedPrice(suggestedPrice: unknown): number {
    const base = Number(suggestedPrice);
    const markup = this.priceMarkupPercent();
    return Math.round(base * (1 + markup / 100) * 100) / 100;
  }

  private snapshotHash(product: ProductForSync, variant: ProductForSync['variants'][number]): string {
    const gallery = product.images.slice().sort((a, b) => a.position - b.position).map((i) => i.url);
    const snapshot = {
      price: this.publishedPrice(variant.suggestedPrice),
      description: product.description ?? '',
      coverUrl: variant.imageUrl ?? product.imageUrl ?? '',
      gallery,
      productStatus: product.status,
      variantStatus: variant.status,
    };
    return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  }

  private pictures(product: ProductForSync, variant: ProductForSync['variants'][number]): Array<{ source: string }> {
    const cover = variant.imageUrl && /^https?:\/\//.test(variant.imageUrl) ? variant.imageUrl : product.imageUrl;
    const urls = [cover, ...product.images.slice().sort((a, b) => a.position - b.position).map((i) => i.url)].filter(
      (url): url is string => Boolean(url) && /^https?:\/\//.test(url as string),
    );
    // Nunca manda a mesma URL duas vezes (a capa pode já estar na galeria).
    return Array.from(new Set(urls)).map((source) => ({ source }));
  }

  private async fetchProducts(companyId: string): Promise<ProductForSync[]> {
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

  private available(variant: ProductForSync['variants'][number]): number {
    if (!variant.inventory) return 0;
    return variant.inventory.onHand - variant.inventory.reserved;
  }

  /** Publica os produtos/variantes ACTIVE que ainda não têm vínculo (`ChannelProductMapping`)
   * confirmado no Mercado Livre — cria o(s) item(ns) que faltam e GRAVA o vínculo (corrige o gap
   * real dos scripts manuais, que nunca persistiam isso). */
  async publishEligible(companyId: string): Promise<{ published: number; failed: number; skipped: number }> {
    const integration = await this.credentialsService.requireIntegration(companyId);
    if (!integration.channelId) return { published: 0, failed: 0, skipped: 0 };
    const channelId = integration.channelId;

    const existingMappings = await this.prisma.client.channelProductMapping.findMany({
      where: { channelId, variantId: { not: null } },
    });
    const mappingByVariant = new Map<string, MappingRow>(existingMappings.map((m) => [m.variantId!, m]));
    const isPublished = (variantId: string) => {
      const m = mappingByVariant.get(variantId);
      return Boolean(
        m?.externalProductId &&
          (m.syncStatus === ChannelMappingSyncStatus.CONFIRMED || m.syncStatus === ChannelMappingSyncStatus.AUTO_MATCHED),
      );
    };

    const { client } = await this.connectorFactory.forCompany(companyId);
    const products = await this.fetchProducts(companyId);

    let published = 0;
    let failed = 0;
    let skipped = 0;

    for (const product of products) {
      const activeVariants = product.variants.filter((v) => v.status === 'ACTIVE');
      if (activeVariants.length === 0) {
        skipped++;
        continue;
      }

      // ACHADO REAL (decisão do usuário, confirmado contra a ficha de atributos real da
      // categoria de bolsas): o Mercado Livre não tem um atributo de TAMANHO nessa categoria —
      // só COR pode variar dentro da mesma família (`family_name`). Um produto que varia por
      // tamanho (com ou sem cor junto) precisa virar um anúncio SEPARADO por tamanho — nunca
      // agrupado com outro tamanho na mesma família. Por isso agrupamos primeiro por tamanho
      // (uma "mini-família" por grupo), e só DENTRO de cada grupo é que a cor vira variação.
      const sizeGroups = new Map<string, ProductForSync['variants']>();
      for (const variant of activeVariants) {
        const key = variant.size ?? '';
        const group = sizeGroups.get(key);
        if (group) group.push(variant);
        else sizeGroups.set(key, [variant]);
      }

      for (const [size, group] of sizeGroups) {
        try {
          const colorVariants = group.filter((v) => v.color);
          const unpublished = (colorVariants.length > 0 ? colorVariants : group).filter((v) => !isPublished(v.id));
          if (unpublished.length === 0) {
            skipped++; // já publicado por completo — fica pra syncPublished
            continue;
          }

          if (colorVariants.length === 0) {
            // Nem cor nem tamanho diferenciam dentro deste grupo: só a mais antiga, item único.
            const variant = group[0];
            if (isPublished(variant.id)) {
              skipped++;
              continue;
            }
            if (this.available(variant) <= 0) {
              skipped++;
              continue;
            }
            await this.publishBaseItem(client, channelId, companyId, product, variant, size || undefined);
            published++;
            continue;
          }

          // Grupo com cores: já existe alguma cor publicada (base ou adicional) NESTE tamanho?
          const alreadyPublishedVariant = colorVariants.find((v) => isPublished(v.id));
          if (alreadyPublishedVariant) {
            const mapping = mappingByVariant.get(alreadyPublishedVariant.id)!;
            const baseItem = await client.getItem(mapping.externalProductId!);
            const categoryId = baseItem.category_id as string;
            const familyName = baseItem.family_name as string;
            const listingTypeId = baseItem.listing_type_id as string;
            const remaining = colorVariants.filter((v) => !isPublished(v.id));
            const counts = await this.publishRemainingColors(client, channelId, companyId, product, remaining, {
              categoryId,
              familyName,
              listingTypeId,
            });
            published += counts.published;
            failed += counts.failed;
            continue;
          }

          // Nenhuma cor publicada ainda neste tamanho — a base é a primeira com estoque disponível.
          const baseVariant = colorVariants.find((v) => this.available(v) > 0);
          if (!baseVariant) {
            skipped++;
            continue;
          }
          const created = await this.publishBaseItem(client, channelId, companyId, product, baseVariant, size || undefined);
          published++;
          // ACHADO REAL corrigido: o item base nascia sem o próprio atributo COLOR (só os
          // scripts manuais faziam esse update de acompanhamento) — sem isso, a cor da base
          // nunca aparecia marcada no anúncio, mesmo o produto tendo variação de cor.
          await this.tagBaseItemColor(client, created.itemId, created.categoryId, baseVariant.color);
          const others = colorVariants.filter((v) => v.id !== baseVariant.id);
          const counts = await this.publishRemainingColors(client, channelId, companyId, product, others, {
            categoryId: created.categoryId,
            familyName: created.familyName,
            listingTypeId: created.listingTypeId,
          });
          published += counts.published;
          failed += counts.failed;
        } catch (error) {
          failed++;
          const message = error instanceof MercadoLivreApiError ? `${error.message} — ${JSON.stringify(error.rawResponse)}` : String(error);
          this.logger.error('mercadolivre_publish_failed', {
            operation: 'publish_eligible',
            productId: product.id,
            size: size || undefined,
            errorMessage: message,
          });
        }
      }
    }

    if (published > 0 || failed > 0) {
      this.logger.log('mercadolivre_products_published', { operation: 'publish_eligible', published, failed, skipped });
    }
    return { published, failed, skipped };
  }

  private async resolveCategoryAndListingType(
    client: Awaited<ReturnType<MercadoLivreConnectorFactory['forCompany']>>['client'],
    title: string,
  ): Promise<{ categoryId: string; listingTypeId: string }> {
    const predictions = await client.predictCategory(SITE_ID, title, 1);
    const categoryId = predictions[0]?.category_id;
    if (!categoryId) throw new Error(`Nenhuma categoria sugerida pro título "${title}".`);

    const listingTypes = await client.getListingTypes(SITE_ID);
    const listingType = listingTypes.find((t) => t.id === PREFERRED_LISTING_TYPE_ID) ?? listingTypes[0];
    if (!listingType) throw new Error(`Nenhum tipo de publicação disponível pro site ${SITE_ID}.`);

    return { categoryId, listingTypeId: listingType.id };
  }

  private async resolveBrandValueId(
    client: Awaited<ReturnType<MercadoLivreConnectorFactory['forCompany']>>['client'],
    categoryId: string,
  ): Promise<string> {
    const attrs = await client.getCategoryAttributes(categoryId);
    const brand = attrs.find((a) => a.id === 'BRAND')?.values?.find((v) => v.name.toLowerCase() === BRAND_FALLBACK_NAME.toLowerCase());
    if (!brand) throw new Error(`Valor de catálogo "${BRAND_FALLBACK_NAME}" pra BRAND não encontrado nesta categoria.`);
    return brand.id;
  }

  /** Monta o título/family_name do anúncio — inclui o tamanho quando o grupo tem um (ver
   * comentário em `publishEligible` sobre por que tamanho vira uma família SEPARADA, nunca uma
   * variação dentro da mesma família de cor), sempre respeitando o limite de 60 caracteres. */
  private buildFamilyTitle(productName: string, size: string | undefined): string {
    if (!size) return productName.length > 60 ? productName.slice(0, 60) : productName;
    const suffix = ` - ${size}`;
    const maxNameLength = 60 - suffix.length;
    const truncatedName = productName.length > maxNameLength ? productName.slice(0, maxNameLength) : productName;
    return `${truncatedName}${suffix}`;
  }

  private async publishBaseItem(
    client: Awaited<ReturnType<MercadoLivreConnectorFactory['forCompany']>>['client'],
    channelId: string,
    companyId: string,
    product: ProductForSync,
    variant: ProductForSync['variants'][number],
    size?: string,
  ): Promise<{ itemId: string; categoryId: string; familyName: string; listingTypeId: string }> {
    const title = this.buildFamilyTitle(product.name, size);
    const { categoryId, listingTypeId } = await this.resolveCategoryAndListingType(client, title);
    const brandValueId = await this.resolveBrandValueId(client, categoryId);

    const payload: MercadoLivreCreateItemInput = {
      category_id: categoryId,
      price: this.publishedPrice(variant.suggestedPrice),
      currency_id: CURRENCY_ID,
      available_quantity: Math.max(this.available(variant), 0),
      buying_mode: 'buy_it_now',
      condition: 'new',
      listing_type_id: listingTypeId,
      family_name: title,
      pictures: this.pictures(product, variant),
      attributes: [
        { id: 'BRAND', value_id: brandValueId },
        { id: 'SELLER_SKU', value_name: variant.sku },
        { id: 'MODEL', value_name: product.baseSku },
      ],
    };

    const created: MercadoLivreCreatedItem = await client.createItem(payload);
    // ACHADO REAL corrigido: o vínculo precisa ser salvo assim que o item existe de fato no
    // Mercado Livre — ANTES de qualquer chamada de acompanhamento (descrição, cor). A ordem
    // antiga salvava o vínculo só depois de `setItemDescription`; uma descrição que o Mercado
    // Livre rejeitasse (conteúdo específico deste produto, nunca confirmado qual) fazia a exceção
    // abortar antes do vínculo ser gravado — o item ficava criado e "invisível" pro sistema, que
    // recriava um NOVO item idêntico no próximo ciclo do agendador, pra sempre (confirmado em
    // produção: 157 anúncios duplicados do mesmo produto).
    await this.saveMapping(channelId, variant.id, created.id, variant.sku, companyId);
    await this.trySetDescription(client, created.id, product.description);

    return { itemId: created.id, categoryId, familyName: title, listingTypeId };
  }

  /** Nunca aborta a publicação por causa da descrição — o item já existe e o vínculo já foi
   * salvo nesse ponto; uma falha aqui só significa que o anúncio fica sem descrição até o
   * próximo ciclo de `syncPublished` tentar de novo (também não-fatal, ver lá). */
  private async trySetDescription(
    client: Awaited<ReturnType<MercadoLivreConnectorFactory['forCompany']>>['client'],
    itemId: string,
    description: string | null,
  ): Promise<void> {
    if (!description) return;
    try {
      await client.setItemDescription(itemId, description);
    } catch (error) {
      const message = error instanceof MercadoLivreApiError ? `${error.message} — ${JSON.stringify(error.rawResponse)}` : String(error);
      this.logger.warn('mercadolivre_set_description_failed', { operation: 'try_set_description', itemId, errorMessage: message });
    }
  }

  /** Marca a cor do próprio item base (nasce sem atributo COLOR — só `add-mercadolivre-
   * variations.ts`, o script manual, fazia esse update de acompanhamento). Nunca aborta a
   * publicação inteira se falhar (ex.: cor sem correspondência no catálogo) — só loga, o item
   * continua publicado e vendável, só sem a etiqueta de cor. */
  private async tagBaseItemColor(
    client: Awaited<ReturnType<MercadoLivreConnectorFactory['forCompany']>>['client'],
    itemId: string,
    categoryId: string,
    color: string | null,
  ): Promise<void> {
    if (!color) return;
    try {
      const attrs = await client.getCategoryAttributes(categoryId);
      const colorValueId = attrs.find((a) => a.id === 'COLOR')?.values?.find((v) => v.name.toLowerCase() === color.toLowerCase())?.id;
      if (!colorValueId) {
        this.logger.warn('mercadolivre_base_color_not_found', { operation: 'tag_base_item_color', itemId, categoryId, color });
        return;
      }
      await client.updateItem(itemId, { attributes: [{ id: 'COLOR', value_id: colorValueId }] });
    } catch (error) {
      this.logger.warn('mercadolivre_base_color_tag_failed', {
        operation: 'tag_base_item_color',
        itemId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Publica cada cor adicional isoladamente — ACHADO REAL corrigido: antes, uma cor sem
   * correspondência no catálogo (ex.: nome em inglês que o Mercado Livre não reconhece) lançava
   * uma exceção que abortava TODAS as demais cores do mesmo produto (mesmo as que teriam
   * funcionado). Mesmo padrão defensivo já usado em `add-mercadolivre-variations.ts`: cada cor
   * conta o próprio sucesso/falha, nunca derruba as irmãs. */
  private async publishRemainingColors(
    client: Awaited<ReturnType<MercadoLivreConnectorFactory['forCompany']>>['client'],
    channelId: string,
    companyId: string,
    product: ProductForSync,
    variants: ProductForSync['variants'],
    base: { categoryId: string; familyName: string; listingTypeId: string },
  ): Promise<{ published: number; failed: number }> {
    let published = 0;
    let failed = 0;
    for (const variant of variants) {
      try {
        await this.publishAdditionalColorItem(client, channelId, companyId, product, variant, base);
        published++;
      } catch (error) {
        failed++;
        const message = error instanceof MercadoLivreApiError ? `${error.message} — ${JSON.stringify(error.rawResponse)}` : String(error);
        this.logger.error('mercadolivre_publish_color_failed', {
          operation: 'publish_remaining_colors',
          productId: product.id,
          variantId: variant.id,
          color: variant.color,
          errorMessage: message,
        });
      }
    }
    return { published, failed };
  }

  private async publishAdditionalColorItem(
    client: Awaited<ReturnType<MercadoLivreConnectorFactory['forCompany']>>['client'],
    channelId: string,
    companyId: string,
    product: ProductForSync,
    variant: ProductForSync['variants'][number],
    base: { categoryId: string; familyName: string; listingTypeId: string },
  ): Promise<void> {
    const attrs = await client.getCategoryAttributes(base.categoryId);
    const colorAttribute = attrs.find((a) => a.id === 'COLOR');
    const colorValueId = colorAttribute?.values?.find((v) => v.name.toLowerCase() === (variant.color ?? '').toLowerCase())?.id;
    if (!colorValueId) {
      throw new Error(`Cor "${variant.color}" não encontrada na lista de valores da categoria ${base.categoryId}.`);
    }
    const brandValueId = await this.resolveBrandValueId(client, base.categoryId);

    const payload: MercadoLivreCreateItemInput = {
      category_id: base.categoryId,
      price: this.publishedPrice(variant.suggestedPrice),
      currency_id: CURRENCY_ID,
      // Estoque real, inclusive 0 — aparece esgotado, nunca omitido do anúncio (mesma decisão já
      // tomada em `add-mercadolivre-variations.ts`).
      available_quantity: Math.max(this.available(variant), 0),
      buying_mode: 'buy_it_now',
      condition: 'new',
      listing_type_id: base.listingTypeId,
      family_name: base.familyName,
      pictures: this.pictures(product, variant),
      attributes: [
        { id: 'BRAND', value_id: brandValueId },
        { id: 'SELLER_SKU', value_name: variant.sku },
        { id: 'MODEL', value_name: product.baseSku },
        { id: 'COLOR', value_id: colorValueId },
      ],
    };

    const created: MercadoLivreCreatedItem = await client.createItem(payload);
    // Mesmo achado/correção de `publishBaseItem`: salva o vínculo assim que o item existe, antes
    // de qualquer chamada de acompanhamento que possa falhar.
    await this.saveMapping(channelId, variant.id, created.id, variant.sku, companyId);
    await this.trySetDescription(client, created.id, product.description);
  }

  private async saveMapping(channelId: string, variantId: string, externalProductId: string, externalSku: string, companyId: string) {
    await this.prisma.client.channelProductMapping.upsert({
      where: { channelId_variantId: { channelId, variantId } },
      create: { channelId, variantId, externalProductId, externalSku, syncStatus: ChannelMappingSyncStatus.CONFIRMED },
      update: { externalProductId, externalSku, syncStatus: ChannelMappingSyncStatus.CONFIRMED },
    });
    await this.audit.log({
      companyId,
      userId: null,
      action: 'MERCADOLIVRE_PRODUCT_PUBLISHED',
      entity: 'channel_product_mapping',
      entityId: variantId,
      newValue: { externalProductId },
    });
  }

  /** Para vínculos já confirmados: recalcula o snapshot (preço, descrição, fotos, status) e só
   * envia ao Mercado Livre o que mudou desde o último push (comparação por hash — nunca só
   * `updatedAt`, porque alterar a galeria de fotos hoje não toca `Product.updatedAt`). */
  async syncPublished(companyId: string): Promise<{ updated: number; failed: number; unchanged: number }> {
    const integration = await this.credentialsService.requireIntegration(companyId);
    if (!integration.channelId) return { updated: 0, failed: 0, unchanged: 0 };
    const channelId = integration.channelId;

    const mappings = await this.prisma.client.channelProductMapping.findMany({
      where: {
        channelId,
        variantId: { not: null },
        externalProductId: { not: null },
        syncStatus: { in: [ChannelMappingSyncStatus.CONFIRMED, ChannelMappingSyncStatus.AUTO_MATCHED] },
      },
      take: MAX_PRODUCTS_PER_CYCLE,
    });
    if (mappings.length === 0) return { updated: 0, failed: 0, unchanged: 0 };

    const products = await this.fetchProducts(companyId);
    const variantToProduct = new Map<string, ProductForSync>();
    for (const product of products) {
      for (const variant of product.variants) variantToProduct.set(variant.id, product);
    }
    // Produtos INACTIVE não entram em `fetchProducts` (filtra status ACTIVE) — busca à parte só
    // pros mapeamentos cujo produto local ficou inativo, pra ainda conseguir pausar o anúncio.
    const missingProductIds = mappings
      .map((m) => variantToProduct.get(m.variantId!) ? null : m.variantId)
      .filter((v): v is string => Boolean(v));
    if (missingProductIds.length > 0) {
      const inactiveVariants = await this.prisma.client.productVariant.findMany({
        where: { id: { in: missingProductIds } },
        include: { product: { include: { images: { orderBy: { position: 'asc' } } } }, inventory: true },
      });
      for (const v of inactiveVariants) {
        const p = v.product;
        const entry: ProductForSync = variantToProduct.get(p.id) ?? {
          id: p.id,
          name: p.name,
          description: p.description,
          status: p.status,
          baseSku: p.baseSku,
          imageUrl: p.imageUrl,
          images: p.images.map((i) => ({ url: i.url, position: i.position })),
          variants: [],
        };
        entry.variants.push({
          id: v.id,
          sku: v.sku,
          color: v.color,
          size: v.size,
          status: v.status,
          suggestedPrice: v.suggestedPrice,
          imageUrl: v.imageUrl,
          inventory: v.inventory ? { onHand: v.inventory.onHand, reserved: v.inventory.reserved } : null,
        });
        variantToProduct.set(v.id, entry);
      }
    }

    const { client } = await this.connectorFactory.forCompany(companyId);

    let updated = 0;
    let failed = 0;
    let unchanged = 0;

    for (const mapping of mappings) {
      const product = variantToProduct.get(mapping.variantId!);
      const variant = product?.variants.find((v) => v.id === mapping.variantId);
      if (!product || !variant) {
        // Variante/produto excluído localmente, mas o vínculo ainda existe — nada a atualizar
        // aqui (fora de escopo: nunca apaga o anúncio automaticamente).
        continue;
      }

      const hash = this.snapshotHash(product, variant);
      if (hash === mapping.lastPushedSnapshotHash) {
        unchanged++;
        continue;
      }

      try {
        await client.updateItem(mapping.externalProductId!, {
          price: this.publishedPrice(variant.suggestedPrice),
          pictures: this.pictures(product, variant),
          // NÃO CONFIRMADO contra uma chamada real (ver script de diagnóstico de confirmação) —
          // ver docs/integrations/mercado-livre.md antes de confiar cegamente neste campo.
          status: product.status === 'ACTIVE' && variant.status === 'ACTIVE' ? 'active' : 'paused',
        });
        await this.trySetDescription(client, mapping.externalProductId!, product.description);
        await this.prisma.client.channelProductMapping.update({
          where: { channelId_variantId: { channelId, variantId: mapping.variantId! } },
          data: { lastPushedSnapshotHash: hash, lastPushedAt: new Date() },
        });
        await this.audit.log({
          companyId,
          userId: null,
          action: 'MERCADOLIVRE_PRODUCT_UPDATED',
          entity: 'channel_product_mapping',
          entityId: mapping.variantId!,
          newValue: { externalProductId: mapping.externalProductId },
        });
        updated++;
      } catch (error) {
        failed++;
        const message = error instanceof MercadoLivreApiError ? `${error.message} — ${JSON.stringify(error.rawResponse)}` : String(error);
        this.logger.error('mercadolivre_update_failed', {
          operation: 'sync_published',
          variantId: mapping.variantId,
          errorMessage: message,
        });
      }
    }

    if (updated > 0 || failed > 0) {
      this.logger.log('mercadolivre_products_updated', { operation: 'sync_published', updated, failed, unchanged });
    }
    return { updated, failed, unchanged };
  }
}
