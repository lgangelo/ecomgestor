import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelMappingSyncStatus } from '@ecommerce-manager/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { MercadoLivreConnectorFactory } from './mercadolivre-connector.factory';
import { MercadoLivreCredentialsService } from './mercadolivre-credentials.service';

export interface MercadoLivreInventoryComparisonRow {
  variantId: string;
  sku: string;
  externalSku: string;
  central: number;
  mercadoLivre: number | null;
  divergent: boolean;
  /** `true` quando a consulta ao Mercado Livre falhou (rate limit, erro transitório, item
   * pausado/excluído) — nesse caso `mercadoLivre` fica `null` e `divergent` fica `false`, mas
   * isso NÃO significa "confirmado igual". Sem esta distinção, `MercadoLivreStockOutboxService`
   * marcaria uma divergência real pendente como resolvida só porque a última consulta falhou
   * (achado real de bug — nunca excluir uma linha `checkFailed` de `divergent` OU de
   * `resolved`). */
  checkFailed: boolean;
}

/**
 * Comparação/push de estoque com o Mercado Livre — mesmo papel de `TikTokInventorySyncService`.
 * Diferente da TikTok (que tem `getInventory`/`updateInventory` na interface `MarketplaceConnector`
 * já implementada pelo `TikTokConnector`), o Mercado Livre não implementa essa interface (decisão
 * do Bloco 1: endpoints de devolução/financeiro nunca foram confirmados) — este serviço chama
 * `MercadoLivreClient.getItem`/`updateItem` diretamente. `available_quantity` é o campo CONFIRMADO
 * em produção (já usado em `publish-mercadolivre-item.ts`/`add-mercadolivre-variations.ts` para
 * criar itens reais) — mesmo campo serve para leitura (`GET /items/{id}`) e escrita
 * (`PUT /items/{id}`).
 */
@Injectable()
export class MercadoLivreInventorySyncService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly credentialsService: MercadoLivreCredentialsService,
    private readonly connectorFactory: MercadoLivreConnectorFactory,
    private readonly audit: AuditService,
  ) {}

  isPushEnabled(): boolean {
    return Boolean(this.configService.get<boolean>('mercadoLivre.inventoryPushEnabled', { infer: true }));
  }

  async compare(companyId: string): Promise<MercadoLivreInventoryComparisonRow[]> {
    const integration = await this.credentialsService.requireIntegration(companyId);
    if (!integration.channelId) return [];

    const mappings = await this.prisma.client.channelProductMapping.findMany({
      where: {
        channelId: integration.channelId,
        syncStatus: { in: [ChannelMappingSyncStatus.CONFIRMED, ChannelMappingSyncStatus.AUTO_MATCHED] },
        variantId: { not: null },
        externalProductId: { not: null },
      },
      include: { variant: { include: { inventory: true } } },
    });
    if (mappings.length === 0) return [];

    const { client } = await this.connectorFactory.forCompany(companyId);

    const rows: MercadoLivreInventoryComparisonRow[] = [];
    for (const mapping of mappings) {
      if (!mapping.variant) continue;
      const inventory = mapping.variant.inventory;
      const central = (inventory?.onHand ?? 0) - (inventory?.reserved ?? 0);

      let mercadoLivreAvailable: number | null = null;
      let checkFailed = false;
      try {
        const item = await client.getItem(mapping.externalProductId!);
        const raw = (item as { available_quantity?: unknown }).available_quantity;
        mercadoLivreAvailable = typeof raw === 'number' ? raw : Number(raw ?? NaN);
        if (!Number.isFinite(mercadoLivreAvailable)) {
          mercadoLivreAvailable = null;
          checkFailed = true;
        }
      } catch {
        // Item não encontrado/erro transitório — nunca trata como divergência real sem saber o
        // valor de verdade, mas TAMBÉM nunca deixa `MercadoLivreStockOutboxService.reconcile`
        // confundir isto com "valores batendo" (ver `checkFailed` na interface acima).
        mercadoLivreAvailable = null;
        checkFailed = true;
      }

      rows.push({
        variantId: mapping.variant.id,
        sku: mapping.variant.sku,
        externalSku: mapping.externalSku ?? mapping.externalProductId!,
        central,
        mercadoLivre: mercadoLivreAvailable,
        divergent: mercadoLivreAvailable !== null && mercadoLivreAvailable !== central,
        checkFailed,
      });
    }

    return rows;
  }

  /** `userId` é `null` quando disparado pelo outbox automático — mesmo papel de
   * `TikTokInventorySyncService.push`. */
  async push(companyId: string, userId: string | null, variantId: string): Promise<{ pushed: number }> {
    if (!this.isPushEnabled()) {
      throw new ForbiddenException(
        'Envio de estoque para o Mercado Livre está desabilitado (MERCADOLIVRE_INVENTORY_PUSH_ENABLED=false).',
      );
    }

    const integration = await this.credentialsService.requireIntegration(companyId);
    if (!integration.channelId) throw new NotFoundException('Canal Mercado Livre ainda não conectado');

    const mapping = await this.prisma.client.channelProductMapping.findFirst({
      where: { channelId: integration.channelId, variantId },
      include: { variant: { include: { inventory: true } } },
    });
    if (!mapping || !mapping.externalProductId || !mapping.variant) {
      throw new NotFoundException('Vínculo de produto com o Mercado Livre não encontrado');
    }

    const inventory = mapping.variant.inventory;
    const central = (inventory?.onHand ?? 0) - (inventory?.reserved ?? 0);

    const { client } = await this.connectorFactory.forCompany(companyId);
    await client.updateItem(mapping.externalProductId, { available_quantity: central });

    await this.audit.log({
      companyId,
      userId,
      action: 'MERCADOLIVRE_INVENTORY_PUSHED',
      entity: 'channel_product_mapping',
      entityId: mapping.id,
      newValue: { variantId, sentAvailable: central },
    });

    return { pushed: central };
  }
}
