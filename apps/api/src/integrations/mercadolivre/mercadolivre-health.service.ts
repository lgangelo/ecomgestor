import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationProvider } from '@ecommerce-manager/database';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Status da integração Mercado Livre — mesmo espírito simples de `shopee-health.service.ts`:
 * ainda não existe nenhum job de sincronização (produtos/pedidos/estoque) rodando, então não há
 * checkpoint nem histórico de falhas pra reportar ainda. Só confirma se está configurada
 * (variáveis de ambiente) e conectada (OAuth concluído).
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
    };
  }
}
