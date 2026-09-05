import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MercadoLivreModule } from './mercadolivre.module';
import { MercadoLivreStockOutboxSchedulerService } from './mercadolivre-stock-outbox-scheduler.service';

/**
 * Módulo separado só para o `@Cron` do outbox de estoque do Mercado Livre — importado apenas por
 * `AppModule` (processo da API), nunca por `WorkerModule` (processo worker), mesmo motivo de
 * `TikTokStockOutboxSchedulerModule`: evitar que o job rode em dobro (uma vez por processo).
 */
@Module({
  imports: [ScheduleModule.forRoot(), MercadoLivreModule],
  providers: [MercadoLivreStockOutboxSchedulerService],
})
export class MercadoLivreStockOutboxSchedulerModule {}
