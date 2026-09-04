import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShopeeClient } from '@ecommerce-manager/integrations';
import { ShopeeCredentialsService } from './shopee-credentials.service';
import { ShopeeTokenRefreshService } from './shopee-token-refresh.service';

/**
 * Monta um `ShopeeClient` já autenticado para UMA empresa — mesmo papel de
 * `tiktok-connector.factory.ts`. Devolve só o cliente HTTP de baixo nível (assinatura + envelope
 * de resposta); não existe ainda um `ShopeeConnector` de alto nível (getOrders/getProducts/...)
 * porque nenhum endpoint de negócio foi confirmado contra uma conta real (ver
 * docs/integrations/shopee.md) — usar `client.request(...)` diretamente até isso acontecer.
 */
@Injectable()
export class ShopeeConnectorFactory {
  constructor(
    private readonly configService: ConfigService,
    private readonly credentialsService: ShopeeCredentialsService,
    private readonly tokenRefresh: ShopeeTokenRefreshService,
  ) {}

  async forCompany(companyId: string): Promise<{ client: ShopeeClient; integrationId: string }> {
    const integration = await this.credentialsService.requireIntegration(companyId);
    const accessToken = await this.tokenRefresh.ensureFreshAccessToken(integration.id, companyId);
    const credentials = await this.credentialsService.getCredentials(integration.id);

    const partnerId = this.configService.get<string>('shopee.partnerId', { infer: true }) as string;
    const partnerKey = this.configService.get<string>('shopee.partnerKey', { infer: true }) as string;
    const sandbox = this.configService.get<boolean>('shopee.sandbox', { infer: true }) as boolean;

    const client = new ShopeeClient({
      partnerId,
      partnerKey,
      accessToken,
      shopId: credentials?.shopId,
      merchantId: credentials?.merchantId,
      sandbox,
    });

    return { client, integrationId: integration.id };
  }
}
