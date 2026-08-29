import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { TikTokStockOutboxService } from './tiktok-stock-outbox.service';

/** Job periódico do outbox de estoque (seção 51-52 da Fase 4) — curto, a cada 5 minutos; nunca
 * no caminho da venda. */
@Injectable()
export class TikTokStockOutboxSchedulerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: TikTokStockOutboxService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext('TikTokStockOutboxScheduler');
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async run() {
    const companies = await this.prisma.client.company.findMany({ select: { id: true } });
    for (const company of companies) {
      try {
        const queued = await this.outbox.reconcile(company.id);
        const { processed, failed } = await this.outbox.processPending(company.id);
        if (queued > 0 || processed > 0 || failed > 0) {
          this.logger.log('stock_outbox_cycle', { operation: 'run', companyId: company.id, queued, processed, failed });
        }
      } catch (error) {
        this.logger.error('stock_outbox_cycle_failed', {
          operation: 'run',
          companyId: company.id,
          error: (error as Error).message,
        });
      }
    }
  }
}
