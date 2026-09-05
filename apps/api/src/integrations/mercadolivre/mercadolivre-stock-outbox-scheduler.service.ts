import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { MercadoLivreStockOutboxService } from './mercadolivre-stock-outbox.service';

const LOCK_TTL_MS = 4 * 60 * 1000;

/** Job periódico do outbox de estoque do Mercado Livre — mesmo papel de
 * `TikTokStockOutboxSchedulerService` (a cada 5 minutos, lock distribuído via Redis pra nunca
 * rodar em paralelo entre réplicas). `MercadoLivreStockOutboxSchedulerModule` garante que isso
 * roda só no processo da API, nunca no worker. */
@Injectable()
export class MercadoLivreStockOutboxSchedulerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly outbox: MercadoLivreStockOutboxService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext('MercadoLivreStockOutboxScheduler');
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async run() {
    const lockKey = 'mercadolivre:stock-outbox-scheduler-lock';
    const acquired = await this.redis.client.set(lockKey, '1', 'PX', LOCK_TTL_MS, 'NX');
    if (!acquired) return;

    try {
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
    } finally {
      await this.redis.client.del(lockKey);
    }
  }
}
