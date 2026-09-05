import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationProvider } from '@ecommerce-manager/database';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Status da integração Mercado Livre — confirma se está configurada (variáveis de ambiente) e
 * conectada (OAuth concluído), mais o checkpoint da sincronização de pedidos (Bloco 1) e o toggle
 * de auto-sync de estoque (Bloco 2). Ainda mais simples que `tiktok-health.service.ts` (sem o
 * cálculo de áreas OK/DEGRADED/STALE) — se isso passar a fazer falta, replicar o mesmo padrão.
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

    return {
      configured,
      connected: integration.status === 'CONNECTED',
      status: integration.status,
      channelId: integration.channelId,
      storeName: integration.storeName,
      lastError: integration.lastError,
      lastSyncAt: integration.lastSyncAt,
      checkpoints: integration.syncCheckpoints,
      autoInventorySyncEnabled: integration.autoInventorySyncEnabled,
    };
  }
}
