import { Injectable } from '@nestjs/common';
import { MercadoLivreClient } from '@ecommerce-manager/integrations';
import { MercadoLivreCredentialsService } from './mercadolivre-credentials.service';
import { MercadoLivreTokenRefreshService } from './mercadolivre-token-refresh.service';

/**
 * Monta um `MercadoLivreClient` já autenticado para UMA empresa — mesmo papel de
 * `shopee-connector.factory.ts`/`tiktok-connector.factory.ts`. Devolve só o cliente HTTP de
 * baixo nível; não existe ainda um conector de alto nível (getOrders/getProducts/...) porque
 * nenhum endpoint de negócio foi confirmado contra uma conta real (ver
 * docs/integrations/mercado-livre.md) — usar `client.request(...)` diretamente até isso
 * acontecer.
 */
@Injectable()
export class MercadoLivreConnectorFactory {
  constructor(
    private readonly credentialsService: MercadoLivreCredentialsService,
    private readonly tokenRefresh: MercadoLivreTokenRefreshService,
  ) {}

  async forCompany(companyId: string): Promise<{ client: MercadoLivreClient; integrationId: string }> {
    const integration = await this.credentialsService.requireIntegration(companyId);
    const accessToken = await this.tokenRefresh.ensureFreshAccessToken(integration.id, companyId);

    const client = new MercadoLivreClient({ accessToken });
    return { client, integrationId: integration.id };
  }
}
