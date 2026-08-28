import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TikTokClient, TikTokConnector } from '@ecommerce-manager/integrations';
import { TikTokCredentialsService } from './tiktok-credentials.service';
import { TikTokTokenRefreshService } from './tiktok-token-refresh.service';

/**
 * Monta um `TikTokConnector` já autenticado para UMA empresa (seção 3 do pedido —
 * responsabilidade "Connector"/"Client" combinadas do lado do backend). Sempre garante um
 * access_token fresco antes de montar o cliente — nenhum chamador precisa saber sobre
 * expiração ou renovação de token.
 */
@Injectable()
export class TikTokConnectorFactory {
  constructor(
    private readonly configService: ConfigService,
    private readonly credentialsService: TikTokCredentialsService,
    private readonly tokenRefresh: TikTokTokenRefreshService,
  ) {}

  async forCompany(companyId: string): Promise<{ connector: TikTokConnector; integrationId: string }> {
    const integration = await this.credentialsService.requireIntegration(companyId);
    const accessToken = await this.tokenRefresh.ensureFreshAccessToken(integration.id, companyId);
    const credentials = await this.credentialsService.getCredentials(integration.id);

    const appKey = this.configService.get<string>('tiktok.appKey', { infer: true }) as string;
    const appSecret = this.configService.get<string>('tiktok.appSecret', { infer: true }) as string;

    const client = new TikTokClient({
      appKey,
      appSecret,
      accessToken,
      shopCipher: credentials?.shopId,
    });

    return {
      connector: new TikTokConnector(client, integration.storeName ?? credentials?.sellerName),
      integrationId: integration.id,
    };
  }
}
