import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TikTokModule } from '../integrations/tiktok/tiktok.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

/** Painel de jobs (seções 45-48 da Fase 4) — importa `TikTokModule` só para reaproveitar
 * `TikTokJobsService.retryAndRequeue` (hoje todo `SyncJob` é um job da integração TikTok). */
@Module({
  imports: [AuditModule, TikTokModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
