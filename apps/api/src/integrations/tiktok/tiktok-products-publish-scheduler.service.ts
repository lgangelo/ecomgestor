import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { TikTokProductsPublishService } from './tiktok-products-publish.service';

// Mesma folga confortável de `tiktok-stock-outbox-scheduler.service.ts` (25% do intervalo do
// `@Cron`) — nunca deveria expirar sozinho no meio de uma execução normal, só serve pra não
// deixar um lock preso pra sempre se o processo morrer no meio do ciclo.
const LOCK_TTL_MS = 4 * 60 * 1000;

/**
 * Job periódico de publicação/atualização automática de produto na TikTok Shop — mesmo padrão
 * do scheduler equivalente do Mercado Livre (`MercadoLivreProductsSyncSchedulerService`): ciclo
 * a cada 5 minutos (decisão do usuário — produtos nascem só na nossa plataforma, o atraso entre
 * "ativar" e "aparecer no canal" precisa ser curto), lock distribuído via Redis (nunca roda em
 * paralelo entre réplicas), só no processo da API (nunca no worker — ver
 * `TikTokProductsPublishSchedulerModule`, mesmo motivo de `TikTokStockOutboxSchedulerModule`).
 *
 * `isEnabled()` (kill switch `TIKTOK_PRODUCTS_SYNC_ENABLED`) nasce DESLIGADO — nada em
 * `TikTokProductsPublishService` foi confirmado ainda contra uma chamada real de criação nesta
 * conta, só contra documentação oficial (ver docs/integrations/tiktok.md).
 */
@Injectable()
export class TikTokProductsPublishSchedulerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly productsPublish: TikTokProductsPublishService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext('TikTokProductsPublishScheduler');
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async run() {
    if (!this.productsPublish.isEnabled()) return;

    const lockKey = 'tiktok:products-publish-scheduler-lock';
    const acquired = await this.redis.client.set(lockKey, '1', 'PX', LOCK_TTL_MS, 'NX');
    if (!acquired) return;

    try {
      const companies = await this.prisma.client.company.findMany({ select: { id: true } });
      for (const company of companies) {
        try {
          const result = await this.productsPublish.publishEligible(company.id);
          if (result.published > 0 || result.failed > 0) {
            this.logger.log('tiktok_products_publish_cycle', { operation: 'run', companyId: company.id, ...result });
          }
        } catch (error) {
          this.logger.error('tiktok_products_publish_cycle_failed', {
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
