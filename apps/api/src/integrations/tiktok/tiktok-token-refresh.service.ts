import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationStatus } from '@ecommerce-manager/database';
import { refreshAccessToken, TikTokApiError } from '@ecommerce-manager/integrations';
import { RedisService } from '../../common/redis/redis.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { TikTokCredentialsService } from './tiktok-credentials.service';

const LOCK_TTL_MS = 15_000;
/** Renova com essa antecedência do vencimento (seção 7 — job preventivo). */
const REFRESH_MARGIN_MS = 60 * 60 * 1000;

/**
 * Renovação de access_token da TikTok Shop com lock distribuído (seção 7 da Fase 3) — evita
 * que duas chamadas concorrentes (ex.: dois jobs de sync rodando ao mesmo tempo) disparem dois
 * refreshes simultâneos para a mesma integração, o que invalidaria um dos refresh_tokens.
 */
@Injectable()
export class TikTokTokenRefreshService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly credentialsService: TikTokCredentialsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext('TikTokTokenRefresh');
  }

  /** Garante um access_token válido para a integração, renovando se necessário. */
  async ensureFreshAccessToken(integrationId: string, companyId: string): Promise<string> {
    const credentials = await this.credentialsService.getCredentials(integrationId);
    if (!credentials) {
      throw new TikTokApiError('Integração TikTok Shop sem credenciais — reconecte a loja.', 'AUTH');
    }

    if (credentials.accessTokenExpiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS) {
      return credentials.accessToken;
    }

    return this.refreshWithLock(integrationId, companyId);
  }

  private async refreshWithLock(integrationId: string, companyId: string): Promise<string> {
    const lockKey = `tiktok:refresh-lock:${integrationId}`;
    const acquired = await this.redis.client.set(lockKey, '1', 'PX', LOCK_TTL_MS, 'NX');

    if (!acquired) {
      // Outra instância já está renovando — aguarda um pouco e relê as credenciais já atualizadas
      // em vez de disparar um segundo refresh concorrente.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const refreshed = await this.credentialsService.getCredentials(integrationId);
      if (refreshed && refreshed.accessTokenExpiresAt.getTime() - Date.now() > 0) {
        return refreshed.accessToken;
      }
      throw new TikTokApiError('Não foi possível confirmar a renovação de token concorrente.', 'TEMPORARY');
    }

    try {
      const credentials = await this.credentialsService.getCredentials(integrationId);
      if (!credentials) {
        throw new TikTokApiError('Integração TikTok Shop sem credenciais — reconecte a loja.', 'AUTH');
      }

      const appKey = this.configService.get<string>('tiktok.appKey', { infer: true }) as string;
      const appSecret = this.configService.get<string>('tiktok.appSecret', { infer: true }) as string;

      try {
        const token = await refreshAccessToken(appKey, appSecret, credentials.refreshToken);
        await this.credentialsService.saveCredentials(integrationId, {
          ...credentials,
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          accessTokenExpiresAt: token.accessTokenExpiresAt,
          refreshTokenExpiresAt: token.refreshTokenExpiresAt,
        });
        this.logger.log('tiktok_token_refreshed', { operation: 'refresh', integrationId });
        return token.accessToken;
      } catch (error) {
        if (error instanceof TikTokApiError && error.category === 'AUTH') {
          await this.prisma.client.integration.update({
            where: { id: integrationId },
            data: {
              status: IntegrationStatus.AUTH_EXPIRED,
              lastError: 'Refresh token expirado ou revogado — reconecte a loja.',
            },
          });
        }
        this.logger.error('tiktok_token_refresh_failed', {
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
