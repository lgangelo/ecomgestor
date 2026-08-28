import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { HOUSEKEEPING_JOBS, HOUSEKEEPING_QUEUE } from './queue.constants';

/**
 * Produtor de jobs. A API enfileira trabalho no Redis; o worker (processo/container
 * separado, ver apps/api/src/worker.ts) consome essa fila e executa o processamento.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly connection: Redis;
  private readonly housekeepingQueue: Queue;

  constructor(private readonly configService: ConfigService) {
    // BullMQ exige maxRetriesPerRequest: null para comandos bloqueantes (BRPOPLPUSH etc.).
    this.connection = new Redis(this.configService.get<string>('redisUrl')!, {
      maxRetriesPerRequest: null,
    });
    this.housekeepingQueue = new Queue(HOUSEKEEPING_QUEUE, { connection: this.connection });
  }

  async enqueuePurgeExpiredRefreshTokens(): Promise<void> {
    await this.housekeepingQueue.add(
      HOUSEKEEPING_JOBS.PURGE_EXPIRED_REFRESH_TOKENS,
      {},
      { removeOnComplete: true, removeOnFail: 50 },
    );
  }

  async onModuleDestroy() {
    await this.housekeepingQueue.close();
    this.connection.disconnect();
  }
}
