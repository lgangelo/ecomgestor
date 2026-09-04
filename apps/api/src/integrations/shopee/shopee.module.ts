import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { ShopeeCredentialsService } from './shopee-credentials.service';
import { ShopeeTokenRefreshService } from './shopee-token-refresh.service';
import { ShopeeConnectorFactory } from './shopee-connector.factory';
import { ShopeeOAuthService } from './shopee-oauth.service';
import { ShopeeOAuthController } from './shopee-oauth.controller';
import { ShopeeHealthService } from './shopee-health.service';
import { ShopeeController } from './shopee.controller';

/**
 * Módulo da integração Shopee — ESQUELETO (config, credenciais, OAuth, cliente HTTP de baixo
 * nível). Nenhum sync de produtos/pedidos/estoque/financeiro ainda: os endpoints de negócio da
 * Shopee Open API não foram confirmados contra uma conta real (ver docs/integrations/shopee.md,
 * "Próximos passos", e a pesquisa completa no mesmo arquivo). Depois de confirmar credenciais de
 * sandbox reais, o próximo passo é adicionar um `ShopeeConnector` (mesmo papel do
 * `TikTokConnector`) e os services de sync equivalentes aos da TikTok
 * (`TikTokProductsSyncService`, `TikTokOrdersSyncService`, ...), reaproveitando o mesmo domínio
 * (`OrdersService`/`InventoryLedgerService`) em vez de duplicar regra de negócio.
 */
@Module({
  imports: [AuditModule],
  controllers: [ShopeeOAuthController, ShopeeController],
  providers: [
    ShopeeCredentialsService,
    ShopeeTokenRefreshService,
    ShopeeConnectorFactory,
    ShopeeOAuthService,
    ShopeeHealthService,
  ],
  exports: [ShopeeCredentialsService, ShopeeTokenRefreshService, ShopeeConnectorFactory],
})
export class ShopeeModule {}
