import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationProvider } from '@ecommerce-manager/database';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Status da integração Shopee — muito mais simples que `tiktok-health.service.ts` de propósito:
 * ainda não existe nenhum job de sincronização (produtos/pedidos/estoque/financeiro) rodando
 * para a Shopee, então não há checkpoint nem histórico de falhas para reportar ainda. Só
 * confirma se está configurada (variáveis de ambiente) e conectada (OAuth concluído).
 */
@Injectable()
export class ShopeeHealthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.configService.get<boolean>('shopee.enabled', { infer: true }));
  }

  async getStatus(companyId: string) {
    const configured = this.isConfigured();
    const integration = await this.prisma.client.integration.findUnique({
      where: { companyId_provider: { companyId, provider: IntegrationProvider.SHOPEE } },
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
    };
  }
}
