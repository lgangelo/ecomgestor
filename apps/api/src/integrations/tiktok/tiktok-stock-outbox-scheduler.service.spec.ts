import { TikTokStockOutboxSchedulerService } from './tiktok-stock-outbox-scheduler.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { RedisService } from '../../common/redis/redis.service';
import type { TikTokStockOutboxService } from './tiktok-stock-outbox.service';
import type { AppLoggerService } from '../../common/logger/app-logger.service';

function makeService(lockAcquired: boolean) {
  const companyFindMany = jest.fn().mockResolvedValue([{ id: 'company-1' }]);
  const redisSet = jest.fn().mockResolvedValue(lockAcquired ? 'OK' : null);
  const redisDel = jest.fn();

  const prisma = { client: { company: { findMany: companyFindMany } } };
  const redis = { client: { set: redisSet, del: redisDel } };
  const outbox = { reconcile: jest.fn().mockResolvedValue(0), processPending: jest.fn().mockResolvedValue({ processed: 0, failed: 0 }) };
  const logger = { setContext: jest.fn(), log: jest.fn(), error: jest.fn() };

  const service = new TikTokStockOutboxSchedulerService(
    prisma as unknown as PrismaService,
    redis as unknown as RedisService,
    outbox as unknown as TikTokStockOutboxService,
    logger as unknown as AppLoggerService,
  );

  return { service, companyFindMany, redisSet, redisDel, outbox };
}

describe('TikTokStockOutboxSchedulerService.run — trava distribuida contra replicas concorrentes', () => {
  it('roda o ciclo normalmente quando consegue o lock', async () => {
    const { service, companyFindMany, redisDel } = makeService(true);

    await service.run();

    expect(companyFindMany).toHaveBeenCalled();
    expect(redisDel).toHaveBeenCalledWith('tiktok:stock-outbox-scheduler-lock');
  });

  it('nunca roda o ciclo (nem consulta empresas) quando outra replica ja segura o lock', async () => {
    const { service, companyFindMany, redisDel } = makeService(false);

    await service.run();

    expect(companyFindMany).not.toHaveBeenCalled();
    expect(redisDel).not.toHaveBeenCalled();
  });
});
