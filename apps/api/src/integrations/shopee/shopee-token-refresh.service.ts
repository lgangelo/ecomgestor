import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationStatus } from '@ecommerce-manager/database';
import { refreshShopeeAccessToken, ShopeeApiError } from '@ecommerce-manager/integrations';
import { RedisService } from '../../common/redis/redis.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { ShopeeCredentialsService } from './shopee-credentials.service';

const LOCK_TTL_MS = 15_000;
/** O access_token da Shopee dura só ~4h (bem mais curto que o da TikTok, 7 dias — ver
 * docs/integrations/shopee.md) — margem de renovação proporcionalmente menor, mas ainda
 * folgada o suficiente para cobrir latência de rede/relógio entre instâncias. */
const REFRESH_MARGIN_MS = 30 * 60 * 1000;

/**
 * Renovação de access_token da Shopee com lock distribuído — mesmo padrão de
 * `tiktok-token-refresh.service.ts`, evita duas chamadas concorrentes invalidando o mesmo
 * refresh_token.
 */
@Injectable()
export class ShopeeTokenRefreshService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly credentialsService: ShopeeCredentialsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext('ShopeeTokenRefresh');
  }

  async ensureFreshAccessToken(integrationId: string, companyId: string): Promise<string> {
    const credentials = await this.credentialsService.getCredentials(integrationId);
    if (!credentials) {
      throw new ShopeeApiError('Integração Shopee sem credenciais — reconecte a loja.', 'AUTH');
    }

    if (credentials.accessTokenExpiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS) {
      return credentials.accessToken;
    }

    return this.refreshWithLock(integrationId, companyId);
  }

  private async refreshWithLock(integrationId: string, companyId: string): Promise<string> {
    const lockKey = `shopee:refresh-lock:${integrationId}`;
    const acquired = await this.redis.client.set(lockKey, '1', 'PX', LOCK_TTL_MS, 'NX');

    if (!acquired) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const refreshed = await this.credentialsService.getCredentials(integrationId);
      if (refreshed && refreshed.accessTokenExpiresAt.getTime() - Date.now() > 0) {
        return refreshed.accessToken;
      }
      throw new ShopeeApiError('Não foi possível confirmar a renovação de token concorrente.', 'TEMPORARY');
    }

    try {
      const credentials = await this.credentialsService.getCredentials(integrationId);
      if (!credentials) {
        throw new ShopeeApiError('Integração Shopee sem credenciais — reconecte a loja.', 'AUTH');
      }

      const partnerId = this.configService.get<string>('shopee.partnerId', { infer: true }) as string;
      const partnerKey = this.configService.get<string>('shopee.partnerKey', { infer: true }) as string;
      const sandbox = this.configService.get<boolean>('shopee.sandbox', { infer: true }) as boolean;

      try {
        const token = await refreshShopeeAccessToken({
          partnerId,
          partnerKey,
          refreshToken: credentials.refreshToken,
          shopId: credentials.shopId,
          mainAccountId: credentials.merchantId,
          sandbox,
        });
        await this.credentialsService.saveCredentials(integrationId, {
          ...credentials,
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          accessTokenExpiresAt: token.accessTokenExpiresAt,
          refreshTokenExpiresAt: token.refreshTokenExpiresAt,
        });
        this.logger.log('shopee_token_refreshed', { operation: 'refresh', integrationId });
        return token.accessToken;
      } catch (error) {
        if (error instanceof ShopeeApiError && error.category === 'AUTH') {
          await this.prisma.client.integration.update({
            where: { id: integrationId },
            data: {
              status: IntegrationStatus.AUTH_EXPIRED,
              lastError: 'Refresh token expirado ou revogado — reconecte a loja.',
            },
          });
        }
        this.logger.error('shopee_token_refresh_failed', {
          operation: 'refresh',
          integrationId,
          companyId,
          message: (error as Error).message,
        });
        throw error;
      }
    } finally {
      await this.redis.client.del(lockKey);
    }
  }
}
