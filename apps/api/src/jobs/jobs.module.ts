import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TikTokModule } from '../integrations/tiktok/tiktok.module';
import { MercadoLivreModule } from '../integrations/mercadolivre/mercadolivre.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

/** Painel de jobs (seções 45-48 da Fase 4) — importa `TikTokModule`/`MercadoLivreModule` só para
 * reaproveitar `TikTokJobsService`/`MercadoLivreJobsService.retryAndRequeue` (o retry despacha
 * pro serviço certo conforme o provider da integração dona do job, ver `JobsService.retry`). */
@Module({
  imports: [AuditModule, TikTokModule, MercadoLivreModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
