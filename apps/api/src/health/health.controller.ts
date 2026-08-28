import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckError,
  HealthCheckService,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisHealthIndicator } from './redis-health.indicator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.checkDatabase(),
      () => this.redis.isHealthy('redis'),
    ]);
  }

  /** Liveness: o processo está de pé (não depende de dependências externas). */
  @Public()
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: pronto para receber tráfego (Postgres e Redis alcançáveis). */
  @Public()
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.checkDatabase(),
      () => this.redis.isHealthy('redis'),
    ]);
  }

  private async checkDatabase(): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
      return { database: { status: 'up' } };
    } catch (error) {
      throw new HealthCheckError('database check failed', {
        database: { status: 'down', message: (error as Error).message },
      });
    }
  }
}
