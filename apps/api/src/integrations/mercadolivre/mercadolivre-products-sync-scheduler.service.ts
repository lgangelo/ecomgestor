import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { MercadoLivreProductsSyncService } from './mercadolivre-products-sync.service';

const LOCK_TTL_MS = 25 * 60 * 1000;

/**
 * Job periódico de publicação/atualização automática de produto (Bloco 3) — mesmo padrão do
 * scheduler de estoque (Bloco 2): `@Cron`, lock distribuído via Redis (nunca roda em paralelo
 * entre réplicas), só no processo da API (nunca no worker — ver
 * `MercadoLivreProductsSyncSchedulerModule`).
 *
 * IMPORTANTE (ver docs/integrations/mercado-livre.md e o plano desta etapa): `updateItem` com
 * `price`/`pictures`/`status` num item JÁ EXISTENTE nunca foi confirmado contra uma chamada real
 * antes deste código — `MERCADOLIVRE_PRODUCTS_SYNC_ENABLED` deve ficar `false` no primeiro deploy
 * até rodar o script de confirmação manual contra 1 item real.
 */
@Injectable()
export class MercadoLivreProductsSyncSchedulerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly productsSync: MercadoLivreProductsSyncService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext('MercadoLivreProductsSyncScheduler');
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async run() {
    if (!this.productsSync.isEnabled()) return;

    const lockKey = 'mercadolivre:products-sync-scheduler-lock';
    const acquired = await this.redis.client.set(lockKey, '1', 'PX', LOCK_TTL_MS, 'NX');
    if (!acquired) return;

    try {
      const companies = await this.prisma.client.company.findMany({ select: { id: true } });
      for (const company of companies) {
        try {
          const publishResult = await this.productsSync.publishEligible(company.id);
          const syncResult = await this.productsSync.syncPublished(company.id);
          if (publishResult.published > 0 || publishResult.failed > 0 || syncResult.updated > 0 || syncResult.failed > 0) {
            this.logger.log('products_sync_cycle', {
              operation: 'run',
              companyId: company.id,
              ...publishResult,
              ...syncResult,
            });
          }
        } catch (error) {
          this.logger.error('products_sync_cycle_failed', {
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
