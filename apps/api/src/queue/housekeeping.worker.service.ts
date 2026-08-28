import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppLoggerService } from '../common/logger/app-logger.service';
import { HOUSEKEEPING_JOBS, HOUSEKEEPING_QUEUE } from './queue.constants';

/**
 * Consumidor da fila `housekeeping`, executado no processo/container do worker
 * (ecommerce-worker). Compartilha a mesma base NestJS da API, mas roda sem servidor HTTP.
 */
@Injectable()
export class HousekeepingWorkerService implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;
  private connection?: Redis;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext('HousekeepingWorker');
  }

  onModuleInit() {
    this.connection = new Redis(this.configService.get<string>('redisUrl')!, {
      maxRetriesPerRequest: null,
    });

    this.worker = new Worker(
      HOUSEKEEPING_QUEUE,
      async (job: Job) => this.process(job),
      { connection: this.connection },
    );

    this.worker.on('completed', (job) => {
      this.logger.log('job_completed', { operation: job.name });
    });
    this.worker.on('failed', (job, err) => {
      this.logger.error('job_failed', { operation: job?.name, message: err.message });
    });
  }

  private async process(job: Job): Promise<void> {
    switch (job.name) {
      case HOUSEKEEPING_JOBS.PURGE_EXPIRED_REFRESH_TOKENS: {
        const result = await this.prisma.client.refreshToken.deleteMany({
          where: { expiresAt: { lt: new Date() } },
        });
        this.logger.log('purged_expired_refresh_tokens', { count: result.count });
        return;
      }
      default:
        this.logger.warn('unknown_job', { operation: job.name });
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
    this.connection?.disconnect();
  }
}
