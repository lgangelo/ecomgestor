import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { MercadoLivreCredentialsService } from './mercadolivre-credentials.service';
import { MercadoLivreTokenRefreshService } from './mercadolivre-token-refresh.service';
import { MercadoLivreConnectorFactory } from './mercadolivre-connector.factory';
import { MercadoLivreOAuthService } from './mercadolivre-oauth.service';
import { MercadoLivreOAuthController } from './mercadolivre-oauth.controller';
import { MercadoLivreHealthService } from './mercadolivre-health.service';
import { MercadoLivreController } from './mercadolivre.controller';

@Module({
  imports: [AuditModule],
  controllers: [MercadoLivreOAuthController, MercadoLivreController],
  providers: [
    MercadoLivreCredentialsService,
    MercadoLivreTokenRefreshService,
    MercadoLivreConnectorFactory,
    MercadoLivreOAuthService,
    MercadoLivreHealthService,
  ],
  exports: [MercadoLivreCredentialsService, MercadoLivreTokenRefreshService, MercadoLivreConnectorFactory],
})
export class MercadoLivreModule {}
