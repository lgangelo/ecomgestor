import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { ReturnsService } from '../../returns/returns.service';
import { TikTokConnectorFactory } from './tiktok-connector.factory';
import { TikTokCredentialsService } from './tiktok-credentials.service';

const MAX_PAGES = 10;

/**
 * Sincronização de devoluções (seção 34-35 da Fase 3). Reaproveita o domínio existente
 * (`ReturnsService.upsertFromExternal`) — nunca movimenta estoque diretamente aqui; a decisão
 * de restock continua manual (seção 36), mesmo para devoluções vindas do canal externo.
 */
@Injectable()
export class TikTokReturnsSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentialsService: TikTokCredentialsService,
    private readonly connectorFactory: TikTokConnectorFactory,
    private readonly returnsService: ReturnsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext('TikTokReturnsSync');
  }

  async syncReturns(companyId: string): Promise<{ synced: number; skipped: number }> {
    const integration = await this.credentialsService.requireIntegration(companyId);
    if (!integration.channelId) throw new BadRequestException('Canal TikTok Shop ainda não conectado.');

    const { connector } = await this.connectorFactory.forCompany(companyId);
    let synced = 0;
    let skipped = 0;
    let pageToken: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await connector.getReturns(companyId, { pageSize: 50, pageToken });

      for (const externalReturn of result.items) {
        const order = await this.prisma.client.order.findUnique({
          where: {
            companyId_channelId_externalOrderId: {
              companyId,
              channelId: integration.channelId,
              externalOrderId: externalReturn.externalOrderId,
            },
          },
        });

        if (!order) {
          // Pedido ainda não importado — a devolução nunca é descartada, só adiada para a
          // próxima reconciliação de pedidos, que a trará antes desta rodar de novo.
          skipped++;
          continue;
        }

        await this.returnsService.upsertFromExternal(order.id, {
          externalReturnId: externalReturn.externalReturnId,
          externalStatus: externalReturn.status,
          reason: externalReturn.reason,
          items: [],
        });
        synced++;
      }

      if (!result.nextPageToken) break;
      pageToken = result.nextPageToken;
    }

    this.logger.log('tiktok_returns_synced', { operation: 'sync_returns', synced, skipped });
    return { synced, skipped };
  }
}
