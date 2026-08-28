import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { HousekeepingWorkerService } from './queue/housekeeping.worker.service';

/**
 * Módulo mínimo executado pelo processo/container `ecommerce-worker`.
 * Compartilha a mesma base NestJS da API (mesmos providers de Prisma/Redis/Logger),
 * mas não expõe HTTP — apenas consome filas do Redis.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate: validateEnv }),
    PrismaModule,
    RedisModule,
  ],
  providers: [HousekeepingWorkerService],
})
export class WorkerModule {}
