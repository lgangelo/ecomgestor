import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelMappingSyncStatus } from '@ecommerce-manager/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { TikTokConnectorFactory } from './tiktok-connector.factory';
import { TikTokCredentialsService } from './tiktok-credentials.service';

export interface InventoryComparisonRow {
  variantId: string;
  sku: string;
  externalSku: string;
  central: number;
  tiktok: number | null;
  divergent: boolean;
}

/**
 * Comparação/push de estoque com a TikTok Shop (seção 37-38-39-40 da Fase 3). Por padrão o
 * sistema SÓ compara — enviar o estoque central para a TikTok exige `TIKTOK_INVENTORY_PUSH_ENABLED=true`
 * (nunca habilitado por padrão) e é sempre uma ação manual e auditada, nunca automática nesta
 * fase, mesmo com a flag ligada (o gatilho automático por venda fica preparado mas não
 * disparado — ver docs/integrations/tiktok.md).
 */
@Injectable()
export class TikTokInventorySyncService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly credentialsService: TikTokCredentialsService,
    private readonly connectorFactory: TikTokConnectorFactory,
    private readonly audit: AuditService,
  ) {}

  isPushEnabled(): boolean {
    return Boolean(this.configService.get<boolean>('tiktok.inventoryPushEnabled', { infer: true }));
  }

  async compare(companyId: string): Promise<InventoryComparisonRow[]> {
    const integration = await this.credentialsService.requireIntegration(companyId);
    if (!integration.channelId) return [];

    const mappings = await this.prisma.client.channelProductMapping.findMany({
      where: {
        channelId: integration.channelId,
        syncStatus: { in: [ChannelMappingSyncStatus.CONFIRMED, ChannelMappingSyncStatus.AUTO_MATCHED] },
        variantId: { not: null },
        externalSku: { not: null },
      },
      include: { variant: { include: { inventory: true } } },
    });
    if (mappings.length === 0) return [];

    const { connector } = await this.connectorFactory.forCompany(companyId);
    const externalSkus = mappings.map((m) => m.externalSku!).filter(Boolean);
    // `page_size` é obrigatório em "Search Products" (confirmado em produção: "PageSize is a
    // required field and has not been provided") — sem isto, "Comparar estoque" falhava sempre.
    const externalInventory = await connector.getInventory(companyId, { externalSkus, pageSize: 50 });
    const externalBySku = new Map(externalInventory.map((e) => [e.externalSku, e.available]));

    return mappings
      .filter((m) => m.variant)
      .map((m) => {
        const inventory = m.variant!.inventory;
        const central = (inventory?.onHand ?? 0) - (inventory?.reserved ?? 0);
        const tiktok = externalBySku.get(m.externalSku!) ?? null;
        return {
          variantId: m.variant!.id,
          sku: m.variant!.sku,
          externalSku: m.externalSku!,
          central,
          tiktok,
          divergent: tiktok !== null && tiktok !== central,
        };
      });
  }

  /**
   * `userId` é `null` quando disparado pelo outbox automático (seção 52 da Fase 4) — nunca uma
   * ação de um usuário interativo nesse caso, mas continua sempre auditado (seção 55/56).
   */
  async push(companyId: string, userId: string | null, variantId: string): Promise<{ pushed: number }> {
    if (!this.isPushEnabled()) {
      throw new ForbiddenException(
        'Envio de estoque para a TikTok Shop está desabilitado (TIKTOK_INVENTORY_PUSH_ENABLED=false).',
      );
    }

    const integration = await this.credentialsService.requireIntegration(companyId);
    if (!integration.channelId) throw new NotFoundException('Canal TikTok Shop ainda não conectado');

    const mapping = await this.prisma.client.channelProductMapping.findFirst({
      where: { channelId: integration.channelId, variantId },
      include: { variant: { include: { inventory: true } } },
    });
    if (!mapping || !mapping.externalSku || !mapping.externalProductId || !mapping.variant) {
      throw new NotFoundException('Vínculo de produto com a TikTok Shop não encontrado');
    }

    const inventory = mapping.variant.inventory;
    const central = (inventory?.onHand ?? 0) - (inventory?.reserved ?? 0);

    const { connector } = await this.connectorFactory.forCompany(companyId);
    await connector.updateInventory(companyId, [
      { externalProductId: mapping.externalProductId, externalSku: mapping.externalSku, available: central },
    ]);

    await this.audit.log({
      companyId,
      userId,
      action: 'TIKTOK_INVENTORY_PUSHED',
      entity: 'channel_product_mapping',
      entityId: mapping.id,
      newValue: { variantId, sentAvailable: central },
    });

    return { pushed: central };
  }
}
