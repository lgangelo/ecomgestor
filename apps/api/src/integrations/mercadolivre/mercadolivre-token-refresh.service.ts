import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationStatus } from '@ecommerce-manager/database';
import { refreshMercadoLivreAccessToken, MercadoLivreApiError } from '@ecommerce-manager/integrations';
import { RedisService } from '../../common/redis/redis.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { MercadoLivreCredentialsService } from './mercadolivre-credentials.service';

const LOCK_TTL_MS = 15_000;
/** Validade do access_token do Mercado Livre não tem um número único confirmado (fontes
 * divergiram entre 10800s/3h e "6 horas" — ver docs/integrations/mercado-livre.md, seção 1);
 * 30 min de margem cobre folgadamente qualquer um dos dois casos. */
const REFRESH_MARGIN_MS = 30 * 60 * 1000;

/**
 * Renovação de access_token do Mercado Livre com lock distribuído — mesmo padrão de
 * `shopee-token-refresh.service.ts`/`tiktok-token-refresh.service.ts`, evita duas chamadas
 * concorrentes invalidando o mesmo refresh_token.
 */
@Injectable()
export class MercadoLivreTokenRefreshService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly credentialsService: MercadoLivreCredentialsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext('MercadoLivreTokenRefresh');
  }

  async ensureFreshAccessToken(integrationId: string, companyId: string): Promise<string> {
    const credentials = await this.credentialsService.getCredentials(integrationId);
    if (!credentials) {
      throw new MercadoLivreApiError('Integração Mercado Livre sem credenciais — reconecte a conta.', 'AUTH');
    }

    if (credentials.accessTokenExpiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS) {
      return credentials.accessToken;
    }

    return this.refreshWithLock(integrationId, companyId);
  }

  private async refreshWithLock(integrationId: string, companyId: string): Promise<string> {
    const lockKey = `mercadolivre:refresh-lock:${integrationId}`;
    const acquired = await this.redis.client.set(lockKey, '1', 'PX', LOCK_TTL_MS, 'NX');

    if (!acquired) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const refreshed = await this.credentialsService.getCredentials(integrationId);
      if (refreshed && refreshed.accessTokenExpiresAt.getTime() - Date.now() > 0) {
        return refreshed.accessToken;
      }
      throw new MercadoLivreApiError('Não foi possível confirmar a renovação de token concorrente.', 'TEMPORARY');
    }

    try {
      const credentials = await this.credentialsService.getCredentials(integrationId);
      if (!credentials) {
        throw new MercadoLivreApiError('Integração Mercado Livre sem credenciais — reconecte a conta.', 'AUTH');
      }

      const clientId = this.configService.get<string>('mercadoLivre.clientId', { infer: true }) as string;
      const clientSecret = this.configService.get<string>('mercadoLivre.clientSecret', { infer: true }) as string;

      try {
        const token = await refreshMercadoLivreAccessToken({ clientId, clientSecret, refreshToken: credentials.refreshToken });
        await this.credentialsService.saveCredentials(integrationId, {
          ...credentials,
          userId: token.userId,
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          accessTokenExpiresAt: token.accessTokenExpiresAt,
        });
        this.logger.log('mercadolivre_token_refreshed', { operation: 'refresh', integrationId });
        return token.accessToken;
      } catch (error) {
        if (error instanceof MercadoLivreApiError && error.category === 'AUTH') {
          await this.prisma.client.integration.update({
            where: { id: integrationId },
            data: {
              status: IntegrationStatus.AUTH_EXPIRED,
              lastError: 'Refresh token expirado ou revogado — reconecte a conta.',
            },
          });
        }
        this.logger.error('mercadolivre_token_refresh_failed', {
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
