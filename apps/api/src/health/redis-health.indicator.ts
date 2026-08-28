import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { RedisService } from '../common/redis/redis.service';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly redisService: RedisService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const pong = await this.redisService.client.ping();
      const up = pong === 'PONG';
      const result = this.getStatus(key, up);
      if (!up) throw new HealthCheckError('redis check failed', result);
      return result;
    } catch (error) {
      throw new HealthCheckError('redis check failed', this.getStatus(key, false, {
        message: (error as Error).message,
      }));
    }
  }
}
