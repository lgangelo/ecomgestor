import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationProvider } from '@ecommerce-manager/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import { INTEGRATION_JOBS } from '../../queue/tiktok-queue.constants';

export interface SyncCheckpoints {
  ordersSyncAt?: string;
  productsSyncAt?: string;
  financeSyncAt?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_AFTER_MS = DAY_MS;

/**
 * Saúde real da integração (seção 8/28/55 da Fase 3) — nunca um "OK" estático: cada área é
 * derivada de dados reais (checkpoint recente, ausência de falhas nas últimas 24h).
 */
@Injectable()
export class TikTokHealthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.configService.get<boolean>('tiktok.enabled', { infer: true }));
  }

  async getStatus(companyId: string) {
    const configured = this.isConfigured();
    const integration = await this.prisma.client.integration.findUnique({
      where: { companyId_provider: { companyId, provider: IntegrationProvider.TIKTOK_SHOP } },
    });

    if (!integration) {
      return { configured, connected: false, status: 'DISCONNECTED' as const };
    }

    const checkpoints = (integration.syncCheckpoints as SyncCheckpoints | null) ?? {};
    const since24h = new Date(Date.now() - DAY_MS);

    const [ordersImported24h, webhooksReceived24h, failedJobs24h, failedJobsByType, pendingMappingCount] =
      await Promise.all([
        integration.channelId
          ? this.prisma.client.order.count({ where: { companyId, channelId: integration.channelId, createdAt: { gte: since24h } } })
          : Promise.resolve(0),
        this.prisma.client.webhookEvent.count({ where: { integrationId: integration.id, receivedAt: { gte: since24h } } }),
        this.prisma.client.syncJob.count({ where: { integrationId: integration.id, status: 'FAILED', createdAt: { gte: since24h } } }),
        this.prisma.client.syncJob.groupBy({
          by: ['type'],
          where: { integrationId: integration.id, status: 'FAILED', createdAt: { gte: since24h } },
          _count: { _all: true },
        }),
        integration.channelId
          ? this.prisma.client.order.count({ where: { companyId, channelId: integration.channelId, integrationSyncStatus: 'REQUIRES_MAPPING' } })
          : Promise.resolve(0),
      ]);

    const failedTypes = new Set(failedJobsByType.map((f) => f.type));
    const isStale = (iso?: string) => !iso || Date.now() - new Date(iso).getTime() > STALE_AFTER_MS;

    const areaStatus = (checkpointKey: keyof SyncCheckpoints, jobType: string): 'OK' | 'DEGRADED' | 'STALE' => {
      if (failedTypes.has(jobType)) return 'DEGRADED';
      if (isStale(checkpoints[checkpointKey])) return 'STALE';
      return 'OK';
    };

    return {
      configured,
      connected: integration.status === 'CONNECTED',
      status: integration.status,
      channelId: integration.channelId,
      storeName: integration.storeName,
      lastSyncAt: integration.lastSyncAt,
      lastError: integration.lastError,
      checkpoints,
      autoInventorySyncEnabled: integration.autoInventorySyncEnabled,
      last24h: {
        ordersImported: ordersImported24h,
        webhooksReceived: webhooksReceived24h,
        failures: failedJobs24h,
      },
      pendingMappingCount,
      areas: {
        oauth: integration.status === 'CONNECTED' ? 'OK' : integration.status,
        orders: areaStatus('ordersSyncAt', INTEGRATION_JOBS.IMPORT_ORDERS),
        products: areaStatus('productsSyncAt', INTEGRATION_JOBS.IMPORT_PRODUCTS),
        finance: areaStatus('financeSyncAt', INTEGRATION_JOBS.SYNC_FINANCE),
        webhooks: failedTypes.has(INTEGRATION_JOBS.PROCESS_WEBHOOK) ? 'DEGRADED' : 'OK',
        // Nunca "OK" fixo — reflete a conclusão da pesquisa (docs/integrations/tiktok.md item
        // 19): não há XML para baixar da TikTok, então este item é sempre informativo.
        fiscal: 'CONFORME_DISPONIBILIDADE',
      },
    };
  }
}
