import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { OrdersService } from '../../orders/orders.service';
import { TikTokConnectorFactory } from './tiktok-connector.factory';

/**
 * Processamento de webhook (seção 22 da Fase 3) — roda no worker, nunca no request HTTP.
 * Nunca confia que o payload do webhook tem tudo que precisa: sempre busca o pedido atual via
 * API antes de aplicar qualquer mudança, e delega inteiramente a `OrdersService` (que já
 * decide corretamente entre criar um pedido novo — histórico — ou atualizar um existente,
 * inclusive rejeitando atualizações fora de ordem).
 */
@Injectable()
export class TikTokWebhookProcessorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connectorFactory: TikTokConnectorFactory,
    private readonly ordersService: OrdersService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext('TikTokWebhookProcessor');
  }

  async process(webhookEventId: string): Promise<void> {
    const event = await this.prisma.client.webhookEvent.findUniqueOrThrow({
      where: { id: webhookEventId },
      include: { integration: true },
    });

    if (event.processedAt) return;

    const payload = event.payload as Record<string, unknown>;
    const externalOrderId = payload.order_id ? String(payload.order_id) : undefined;
    const integration = event.integration;

    if (!externalOrderId || !integration.channelId) {
      await this.markProcessed(event.id, 'IGNORED_NO_ORDER_REFERENCE');
      return;
    }

    const { connector } = await this.connectorFactory.forCompany(integration.companyId);
    const freshOrder = await connector.getOrder(integration.companyId, externalOrderId);

    const existing = await this.prisma.client.order.findUnique({
      where: {
        companyId_channelId_externalOrderId: {
          companyId: integration.companyId,
          channelId: integration.channelId,
          externalOrderId,
        },
      },
    });

    if (existing) {
      await this.ordersService.applyExternalStatusUpdate(integration.companyId, existing.id, null, freshOrder);
    } else {
      await this.ordersService.importExternalOrder(integration.companyId, integration.channelId, null, freshOrder);
    }

    await this.markProcessed(event.id, 'OK');
    this.logger.log('tiktok_webhook_processed', { operation: 'process_webhook', externalOrderId });
  }

  private async markProcessed(id: string, status: string): Promise<void> {
    await this.prisma.client.webhookEvent.update({
      where: { id },
      data: { processedAt: new Date(), status },
    });
  }
}
