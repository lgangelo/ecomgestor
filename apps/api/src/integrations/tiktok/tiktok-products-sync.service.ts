import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ChannelMappingSyncStatus, ProductStatus, VariantStatus } from '@ecommerce-manager/database';
import { extractSellerSku } from '@ecommerce-manager/integrations';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { TikTokConnectorFactory } from './tiktok-connector.factory';
import { TikTokCredentialsService } from './tiktok-credentials.service';

const MAX_PAGES = 20;

export interface UnmatchedTikTokProduct {
  externalProductId: string;
  externalSku: string;
  sellerSku?: string;
  name: string;
  stock: number;
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
  ) {}

  async listUnmatched(companyId: string): Promise<UnmatchedTikTokProduct[]> {
    const integration = await this.credentialsService.requireIntegration(companyId);
    if (!integration.channelId) return [];

    const { connector } = await this.connectorFactory.forCompany(companyId);
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

    const unmatched: UnmatchedTikTokProduct[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await connector.getProducts(companyId, { pageSize: 50, pageToken });
      for (const product of result.items) {
        if (mappedSkus.has(product.externalSku)) continue;
        const sellerSku = extractSellerSku(product.raw);
        const candidates = sellerSku ? (variantBySku.get(sellerSku) ?? []) : [];
        unmatched.push({
          externalProductId: product.externalProductId,
          externalSku: product.externalSku,
          sellerSku,
          name: product.name,
          stock: product.stock,
          suggestedVariantId: candidates.length === 1 ? candidates[0] : undefined,
          suggestedSku: candidates.length === 1 ? sellerSku : undefined,
          ambiguous: candidates.length > 1,
        });
      }
      if (!result.nextPageToken) break;
      pageToken = result.nextPageToken;
    }

    return unmatched;
  }

  /**
   * Disparado pelo job em segundo plano (seção 9-51) — nunca recomputado/persistido além do
   * checkpoint: a lista de não-vinculados continua sempre calculada ao vivo em `listUnmatched`
   * (mais correto que cache, já que estoque/catálogo mudam constantemente do lado da TikTok).
   * Este método existe para validar a conectividade em segundo plano e alimentar o checkpoint
   * exibido no painel de saúde (seção 8/28), sem bloquear o request HTTP que disparou a importação.
   */
  async runProductsCheck(companyId: string): Promise<{ unmatchedCount: number }> {
    const integration = await this.credentialsService.requireIntegration(companyId);
    const unmatched = await this.listUnmatched(companyId);

    const checkpoints = (integration.syncCheckpoints as Record<string, string> | null) ?? {};
    await this.prisma.client.integration.update({
      where: { id: integration.id },
      data: { syncCheckpoints: { ...checkpoints, productsSyncAt: new Date().toISOString() } },
    });

    return { unmatchedCount: unmatched.length };
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

  /** Cria um produto interno novo a partir dos dados do produto TikTok (seção 10, ação "Criar produto interno"). */
  async createInternalProduct(
    companyId: string,
    userId: string,
    externalSku: string,
    externalProductId: string | undefined,
    input: { name: string; sku: string; price: string },
  ) {
    const integration = await this.credentialsService.requireIntegration(companyId);
    if (!integration.channelId) throw new BadRequestException('Canal TikTok Shop ainda não conectado');

    const product = await this.prisma.client.product.create({
      data: {
        companyId,
        name: input.name,
        baseSku: input.sku,
        status: ProductStatus.DRAFT,
        variants: {
          create: [{ sku: input.sku, suggestedPrice: input.price, status: VariantStatus.ACTIVE }],
        },
      },
      include: { variants: true },
    });

    const variant = product.variants[0];
    const mapping = await this.link(companyId, userId, externalSku, externalProductId, variant.id);

    await this.audit.log({
      companyId,
      userId,
      action: 'TIKTOK_PRODUCT_CREATED',
      entity: 'product',
      entityId: product.id,
      newValue: { externalSku, sku: input.sku },
    });

    return { product, mapping };
  }
}
