import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { MercadoLivreProductsSyncService } from './mercadolivre-products-sync.service';

// DECISÃO DO USUÁRIO: ciclo a cada 5 minutos (antes 30) — produtos agora são cadastrados só na
// nossa plataforma e publicados/atualizados automaticamente quando viram ACTIVE, então o atraso
// entre "ativar" e "aparecer no canal" precisa ser curto. O ciclo em si já é barato quando não há
// mudança nenhuma (hash bate, `syncPublished` pula sem chamar a API) — "se não tiver alteração,
// descarta", nunca reenvia à toa. TTL do lock reduzido junto (era 25min, quase o período antigo de
// 30min) pra continuar sempre menor que o intervalo do cron, senão uma execução travada bloquearia
// vários ciclos seguidos.
const LOCK_TTL_MS = 4 * 60 * 1000;

/**
 * Job periódico de publicação/atualização automática de produto (Bloco 3) — mesmo padrão do
 * scheduler de estoque (Bloco 2): `@Cron`, lock distribuído via Redis (nunca roda em paralelo
 * entre réplicas), só no processo da API (nunca no worker — ver
 * `MercadoLivreProductsSyncSchedulerModule`).
 *
 * `updateItem`/`createItem` com preço/fotos/status/atributos num item já existente já foram
 * confirmados contra chamadas reais em produção (ver docs/integrations/mercado-livre.md) —
 * `MERCADOLIVRE_PRODUCTS_SYNC_ENABLED` já roda ligado.
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

  @Cron(CronExpression.EVERY_5_MINUTES)
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
