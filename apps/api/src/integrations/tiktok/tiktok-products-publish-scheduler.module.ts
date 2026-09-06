import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TikTokModule } from './tiktok.module';
import { TikTokProductsPublishSchedulerService } from './tiktok-products-publish-scheduler.service';

/**
 * Módulo separado só para o `@Cron` da publicação/atualização de produto — importado apenas por
 * `AppModule` (processo da API), nunca por `WorkerModule` (processo worker). Mesmo motivo de
 * `TikTokStockOutboxSchedulerModule`: manter o scheduler fora de `TikTokModule` evita que o job
 * rode em dobro (uma vez por processo), o que causaria criação/atualização duplicada de produtos
 * na TikTok Shop.
 */
@Module({
  imports: [ScheduleModule.forRoot(), TikTokModule],
  providers: [TikTokProductsPublishSchedulerService],
})
export class TikTokProductsPublishSchedulerModule {}
