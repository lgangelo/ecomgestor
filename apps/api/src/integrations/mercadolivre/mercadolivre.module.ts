import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { OrdersModule } from '../../orders/orders.module';
import { MercadoLivreCredentialsService } from './mercadolivre-credentials.service';
import { MercadoLivreTokenRefreshService } from './mercadolivre-token-refresh.service';
import { MercadoLivreConnectorFactory } from './mercadolivre-connector.factory';
import { MercadoLivreOAuthService } from './mercadolivre-oauth.service';
import { MercadoLivreOAuthController } from './mercadolivre-oauth.controller';
import { MercadoLivreHealthService } from './mercadolivre-health.service';
import { MercadoLivreController } from './mercadolivre.controller';
import { MercadoLivreOrdersSyncService } from './mercadolivre-orders-sync.service';
import { MercadoLivreJobsService } from './mercadolivre-jobs.service';
import { MercadoLivreQueueService } from '../../queue/mercadolivre-queue.service';

@Module({
  imports: [AuditModule, OrdersModule],
  controllers: [MercadoLivreOAuthController, MercadoLivreController],
  providers: [
    MercadoLivreCredentialsService,
    MercadoLivreTokenRefreshService,
    MercadoLivreConnectorFactory,
    MercadoLivreOAuthService,
    MercadoLivreHealthService,
    MercadoLivreOrdersSyncService,
    MercadoLivreJobsService,
    MercadoLivreQueueService,
  ],
  exports: [
    MercadoLivreCredentialsService,
    MercadoLivreTokenRefreshService,
    MercadoLivreConnectorFactory,
    MercadoLivreOrdersSyncService,
    MercadoLivreJobsService,
    MercadoLivreQueueService,
  ],
})
export class MercadoLivreModule {}
