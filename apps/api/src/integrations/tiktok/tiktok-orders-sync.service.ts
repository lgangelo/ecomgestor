import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { OrdersService } from '../../orders/orders.service';
import { TikTokConnectorFactory } from './tiktok-connector.factory';
import { TikTokCredentialsService } from './tiktok-credentials.service';

const MAX_PAGES = 20;
/** Janela de sobreposição (seção 13 da Fase 3) — protege contra pedidos atualizados por um
 * instante entre a última sincronização e agora que poderiam ser perdidos numa busca exata. */
const OVERLAP_MS = 10 * 60 * 1000;

interface SyncCheckpoints {
  ordersSyncAt?: string;
  productsSyncAt?: string;
  financeSyncAt?: string;
}

/**
 * Sincronização incremental de pedidos (seção 13-14-15-17-18 da Fase 3). Usada tanto pela
 * importação inicial (wizard) quanto pela reconciliação periódica — ambas são, na prática, a
 * mesma operação: buscar pedidos atualizados desde o checkpoint (com sobreposição) e fazer
 * upsert via `OrdersService.importExternalOrder`, que decide sozinho se é uma criação
 * histórica ou uma atualização de status de um pedido já existente.
 */
@Injectable()
export class TikTokOrdersSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentialsService: TikTokCredentialsService,
    private readonly connectorFactory: TikTokConnectorFactory,
    private readonly ordersService: OrdersService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext('TikTokOrdersSync');
  }

  async syncOrders(
    companyId: string,
    userId: string | null,
    explicitSince?: Date,
  ): Promise<{ imported: number; updated: number; skipped: number }> {
    const integration = await this.credentialsService.requireIntegration(companyId);
    if (!integration.channelId) {
      throw new BadRequestException('Canal TikTok Shop ainda não conectado.');
    }

    const { connector } = await this.connectorFactory.forCompany(companyId);
    const checkpoints = (integration.syncCheckpoints as SyncCheckpoints | null) ?? {};
    const lastSync = checkpoints.ordersSyncAt ? new Date(checkpoints.ordersSyncAt) : undefined;
    const updatedAfter = explicitSince ?? (lastSync ? new Date(lastSync.getTime() - OVERLAP_MS) : undefined);

    const startedAt = new Date();
    let imported = 0;
    let updated = 0;
    // Nenhum item é descartado nesta etapa — `OrdersService.importExternalOrder` sempre cria
    // ou atualiza (mesmo com SKU sem vínculo, seção 15); mantido para consistência de forma
    // com o restante da API de sincronização, que pode ter itens pulados por outros motivos.
    const skipped = 0;
    let pageToken: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await connector.getOrders(companyId, { pageSize: 50, pageToken, updatedAfter });
      for (const order of result.items) {
        const { created } = await this.ordersService.importExternalOrder(
          companyId,
          integration.channelId,
          userId,
          order,
        );
        if (created) imported++;
        else updated++;
      }
      if (!result.nextPageToken) break;
      pageToken = result.nextPageToken;
    }

    await this.prisma.client.integration.update({
      where: { id: integration.id },
      data: {
        lastSyncAt: new Date(),
        syncCheckpoints: { ...checkpoints, ordersSyncAt: startedAt.toISOString() },
      },
    });

    this.logger.log('tiktok_orders_synced', { operation: 'sync_orders', imported, updated, skipped });
    return { imported, updated, skipped };
  }
}
