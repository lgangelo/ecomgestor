import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { TikTokStockOutboxService } from './tiktok-stock-outbox.service';

// Folga confortável acima dos 5 min do próprio @Cron — nunca deveria expirar sozinho no meio de
// uma execução normal, só serve pra não deixar um lock preso pra sempre se o processo morrer
// no meio do ciclo sem chegar no `finally`.
const LOCK_TTL_MS = 4 * 60 * 1000;

/** Job periódico do outbox de estoque (seção 51-52 da Fase 4) — curto, a cada 5 minutos; nunca
 * no caminho da venda.
 *
 * O `TikTokStockOutboxSchedulerModule` já garante que isso roda só no processo da API (nunca no
 * worker) — mas isso não protege contra a API rodar em MAIS DE UMA réplica (ex.: `docker compose
 * up --scale ecommerce-api=N`), onde cada réplica dispararia seu próprio ciclo a cada 5 min,
 * multiplicando pushes reais de estoque pra TikTok por N. Não é o caso hoje (deploy de uma
 * réplica só), mas é o MESMO tipo de bug já confirmado em produção pros jobs do BullMQ
 * (upsertJobScheduler) — mais barato prevenir aqui agora do que descobrir depois de escalar.
 * Lock distribuído com o mesmo padrão já usado em `tiktok-token-refresh.service.ts`. */
@Injectable()
export class TikTokStockOutboxSchedulerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly outbox: TikTokStockOutboxService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext('TikTokStockOutboxScheduler');
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async run() {
    const lockKey = 'tiktok:stock-outbox-scheduler-lock';
    const acquired = await this.redis.client.set(lockKey, '1', 'PX', LOCK_TTL_MS, 'NX');
    if (!acquired) {
      // Outra réplica já está no meio deste ciclo — nunca roda em paralelo, só espera o
      // próximo tick de 5 min.
      return;
    }

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
