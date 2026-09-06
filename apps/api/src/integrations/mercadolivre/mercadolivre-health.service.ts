import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationProvider } from '@ecommerce-manager/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MERCADO_LIVRE_JOBS } from '../../queue/mercadolivre-queue.constants';

export interface MercadoLivreSyncCheckpoints {
  ordersSyncAt?: string;
  productsSyncAt?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_AFTER_MS = DAY_MS;

/**
 * Status da integração Mercado Livre — mesmo padrão de `tiktok-health.service.ts` (saúde real
 * derivada de dados reais: checkpoint recente, ausência de falhas nas últimas 24h — nunca um "OK"
 * estático). Sem "webhooks" (o Mercado Livre é sincronizado por polling periódico, não há receptor
 * de webhook implementado) nem "pedidos com SKU pendente" (não existe hoje um equivalente ao
 * `REQUIRES_MAPPING` da TikTok neste canal).
 */
@Injectable()
export class MercadoLivreHealthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.configService.get<boolean>('mercadoLivre.enabled', { infer: true }));
  }

  async getStatus(companyId: string) {
    const configured = this.isConfigured();
    const integration = await this.prisma.client.integration.findUnique({
      where: { companyId_provider: { companyId, provider: IntegrationProvider.MERCADO_LIVRE } },
    });

    if (!integration) {
      return { configured, connected: false, status: 'DISCONNECTED' as const };
    }

    const checkpoints = (integration.syncCheckpoints as MercadoLivreSyncCheckpoints | null) ?? {};
    const since24h = new Date(Date.now() - DAY_MS);

    const [ordersImported24h, failedJobs24h, failedJobsByType, publishedProductCount, stockSyncErrorCount] =
      await Promise.all([
        integration.channelId
          ? this.prisma.client.order.count({ where: { companyId, channelId: integration.channelId, createdAt: { gte: since24h } } })
          : Promise.resolve(0),
        this.prisma.client.syncJob.count({ where: { integrationId: integration.id, status: 'FAILED', createdAt: { gte: since24h } } }),
        this.prisma.client.syncJob.groupBy({
          by: ['type'],
          where: { integrationId: integration.id, status: 'FAILED', createdAt: { gte: since24h } },
          _count: { _all: true },
        }),
        integration.channelId
          ? this.prisma.client.channelProductMapping.count({
              where: { channelId: integration.channelId, externalProductId: { not: null } },
            })
          : Promise.resolve(0),
        integration.channelId
          ? this.prisma.client.stockSyncOutboxEntry.count({ where: { channelId: integration.channelId, status: 'FAILED' } })
          : Promise.resolve(0),
      ]);

    const failedTypes = new Set(failedJobsByType.map((f) => f.type));
    const isStale = (iso?: string) => !iso || Date.now() - new Date(iso).getTime() > STALE_AFTER_MS;

    return {
      configured,
      connected: integration.status === 'CONNECTED',
      status: integration.status,
      channelId: integration.channelId,
      storeName: integration.storeName,
      lastError: integration.lastError,
      lastSyncAt: integration.lastSyncAt,
      checkpoints,
      autoInventorySyncEnabled: integration.autoInventorySyncEnabled,
      publishedProductCount,
      last24h: {
        ordersImported: ordersImported24h,
        failures: failedJobs24h,
      },
      areas: {
        oauth: integration.status === 'CONNECTED' ? 'OK' : integration.status,
        orders:
          failedTypes.has(MERCADO_LIVRE_JOBS.IMPORT_ORDERS) || failedTypes.has(MERCADO_LIVRE_JOBS.RECONCILE_ORDERS)
            ? 'DEGRADED'
            : isStale(checkpoints.ordersSyncAt)
              ? 'STALE'
              : 'OK',
        products:
          failedTypes.has(MERCADO_LIVRE_JOBS.PUBLISH_PRODUCT_COLOR) ||
          failedTypes.has(MERCADO_LIVRE_JOBS.PUBLISH_PRODUCT_DESCRIPTION)
            ? 'DEGRADED'
            : isStale(checkpoints.productsSyncAt)
              ? 'STALE'
              : 'OK',
        inventory: stockSyncErrorCount > 0 ? 'DEGRADED' : 'OK',
        // Dados fiscais (NCM/CSOSN/etc.) viajam junto do ciclo de produtos (ver
        // `MercadoLivreProductsSyncService.tryFiscalInformation`) — confirmados funcionando em
        // produção, mas nunca bloqueiam preço/foto/status se falharem, então reflete o mesmo sinal
        // da área "products" em vez de ter rastreamento próprio.
        fiscal:
          failedTypes.has(MERCADO_LIVRE_JOBS.PUBLISH_PRODUCT_COLOR) ||
          failedTypes.has(MERCADO_LIVRE_JOBS.PUBLISH_PRODUCT_DESCRIPTION)
            ? 'DEGRADED'
            : isStale(checkpoints.productsSyncAt)
              ? 'STALE'
              : 'OK',
      },
    };
  }
}
