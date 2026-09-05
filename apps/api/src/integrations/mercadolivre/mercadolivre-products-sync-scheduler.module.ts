import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MercadoLivreModule } from './mercadolivre.module';
import { MercadoLivreProductsSyncSchedulerService } from './mercadolivre-products-sync-scheduler.service';

/**
 * Módulo separado só para o `@Cron` de publicação/atualização de produto (Bloco 3) — importado
 * apenas por `AppModule` (processo da API), nunca por `WorkerModule`, mesmo motivo já documentado
 * em `mercadolivre-stock-outbox-scheduler.module.ts`: evitar que o job rode em dobro.
 */
@Module({
  imports: [ScheduleModule.forRoot(), MercadoLivreModule],
  providers: [MercadoLivreProductsSyncSchedulerService],
})
export class MercadoLivreProductsSyncSchedulerModule {}
