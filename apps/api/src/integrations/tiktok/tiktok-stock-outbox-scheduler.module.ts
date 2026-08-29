import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TikTokModule } from './tiktok.module';
import { TikTokStockOutboxSchedulerService } from './tiktok-stock-outbox-scheduler.service';

/**
 * Módulo separado só para o `@Cron` do outbox de estoque — importado apenas por `AppModule`
 * (processo da API), nunca por `WorkerModule` (processo worker). `TikTokModule` é a única
 * dependência compartilhada entre os dois processos; manter o scheduler fora dele evita que o
 * job de reconciliação rode em dobro (uma vez por processo), o que causaria pushes reais
 * duplicados para a TikTok.
 */
@Module({
  imports: [ScheduleModule.forRoot(), TikTokModule],
  providers: [TikTokStockOutboxSchedulerService],
})
export class TikTokStockOutboxSchedulerModule {}
