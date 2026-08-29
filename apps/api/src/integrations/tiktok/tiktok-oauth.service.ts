import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelType, IntegrationProvider, IntegrationStatus } from '@ecommerce-manager/database';
import { buildAuthorizeUrl, exchangeAuthorizationCode, getAuthorizedShops, TikTokClient } from '@ecommerce-manager/integrations';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { AuditService } from '../../audit/audit.service';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { TikTokQueueService } from '../../queue/tiktok-queue.service';
import { TikTokCredentialsService } from './tiktok-credentials.service';

const STATE_TTL_SECONDS = 600;

interface OAuthStatePayload {
  companyId: string;
  userId: string;
}

/**
 * OAuth da TikTok Shop (seção 6 da Fase 3). O callback (`GET .../callback`) é uma navegação
 * de topo vinda de tiktokshop.com — como os cookies de sessão desta aplicação usam
 * `SameSite=Strict` (ver auth.controller.ts), eles NUNCA acompanham essa requisição entre
 * sites. Por isso o callback é uma rota pública (`@Public()`) e o `state` — aleatório,
 * criptograficamente seguro, uso único, com TTL curto, gerado e validado só no servidor — é o
 * único mecanismo de confiança: ele é quem diz a que empresa/usuário a conexão pertence, nunca
 * o cookie de sessão. Isso também é a proteção contra replay exigida na seção 6: uma vez
 * consumido, o state é apagado do Redis antes mesmo da troca do código começar.
 */
@Injectable()
export class TikTokOAuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly credentialsService: TikTokCredentialsService,
    private readonly queue: TikTokQueueService,
    private readonly audit: AuditService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext('TikTokOAuth');
  }

  isConfigured(): boolean {
    return Boolean(this.configService.get<boolean>('tiktok.enabled', { infer: true }));
  }

  private requireConfigured(): void {
    if (!this.isConfigured()) {
      throw new BadRequestException(
        'TikTok Shop não configurado. Configure TIKTOK_APP_KEY e TIKTOK_APP_SECRET para conectar sua loja.',
      );
    }
    if (!this.configService.get<string>('tiktok.serviceId', { infer: true })) {
      throw new BadRequestException(
        'TikTok Shop não configurado. Configure TIKTOK_SERVICE_ID (Partner Center → App & Service, ' +
          'não é o mesmo valor do App Key) para conectar sua loja.',
      );
    }
  }

  async buildConnectUrl(companyId: string, userId: string): Promise<string> {
    this.requireConfigured();
    const serviceId = this.configService.get<string>('tiktok.serviceId', { infer: true }) as string;
    const state = randomBytes(32).toString('hex');
    const payload: OAuthStatePayload = { companyId, userId };
    await this.redis.client.set(`tiktok:oauth-state:${state}`, JSON.stringify(payload), 'EX', STATE_TTL_SECONDS);
    return buildAuthorizeUrl(serviceId, state);
  }

  async handleCallback(state: string | undefined, code: string | undefined, ip?: string): Promise<{ webAppUrl: string }> {
    this.requireConfigured();
    const webAppUrl = this.configService.get<string>('webAppUrl')!;

    if (!state || !code) {
      throw new BadRequestException('Callback OAuth da TikTok Shop sem state ou code.');
    }

    const stateKey = `tiktok:oauth-state:${state}`;
    const raw = await this.redis.client.get(stateKey);
    // Uso único: apaga imediatamente, antes de qualquer chamada de rede — uma segunda
    // requisição com o mesmo state (replay) nunca mais encontra o valor.
    await this.redis.client.del(stateKey);

    if (!raw) {
      throw new BadRequestException('State OAuth inválido, expirado ou já utilizado.');
    }
    const { companyId, userId } = JSON.parse(raw) as OAuthStatePayload;

    const appKey = this.configService.get<string>('tiktok.appKey', { infer: true }) as string;
    const appSecret = this.configService.get<string>('tiktok.appSecret', { infer: true }) as string;

    const token = await exchangeAuthorizationCode(appKey, appSecret, code);

    // shop_id/shop_cipher nunca vêm no token OAuth — só "Get Authorized Shops" os retorna, e o
    // shop_cipher é exigido em quase toda chamada de negócio (ver tiktok-connector.factory.ts).
    // Assume-se um único shop autorizado por token: é a única topologia possível para um Custom
    // App do Partner Center (uso interno de um único seller), diferente de um Public App.
    const shopsClient = new TikTokClient({ appKey, appSecret, accessToken: token.accessToken });
    const shops = await getAuthorizedShops(shopsClient);
    const shop = shops[0];

    const integration = await this.credentialsService.getOrCreateIntegration(companyId);
    await this.credentialsService.saveCredentials(integration.id, {
      shopId: shop?.shopId ?? token.shopId,
      shopCipher: shop?.shopCipher,
      sellerName: shop?.shopName ?? token.sellerName,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      accessTokenExpiresAt: token.accessTokenExpiresAt,
      refreshTokenExpiresAt: token.refreshTokenExpiresAt,
      region: shop?.region,
    });

    const channel = await this.prisma.client.salesChannel.upsert({
      where: { companyId_type_name: { companyId, type: ChannelType.TIKTOK_SHOP, name: 'TikTok Shop' } },
      create: { companyId, type: ChannelType.TIKTOK_SHOP, name: 'TikTok Shop', isManual: false },
      update: {},
    });

    await this.prisma.client.integration.update({
      where: { id: integration.id },
      data: {
        channelId: channel.id,
        provider: IntegrationProvider.TIKTOK_SHOP,
        status: IntegrationStatus.CONNECTED,
        storeName: shop?.shopName ?? token.sellerName ?? null,
        lastError: null,
      },
    });

    const intervalMinutes = this.configService.get<number>('tiktok.reconcileIntervalMinutes', { infer: true }) as number;
    await this.queue.ensureReconcileSchedule(companyId, intervalMinutes);

    await this.audit.log({
      companyId,
      userId,
      action: 'INTEGRATION_TIKTOK_CONNECTED',
      entity: 'integration',
      entityId: integration.id,
      newValue: { storeName: shop?.shopName ?? token.sellerName, shopId: shop?.shopId ?? token.shopId },
      ip,
    });
    this.logger.log('tiktok_connected', { operation: 'oauth_callback', userId });

    return { webAppUrl };
  }

  async disconnect(companyId: string, userId: string, ip?: string): Promise<void> {
    const integration = await this.credentialsService.requireIntegration(companyId);
    await this.prisma.client.integrationCredential.deleteMany({ where: { integrationId: integration.id } });
    await this.prisma.client.integration.update({
      where: { id: integration.id },
      data: { status: IntegrationStatus.DISCONNECTED, lastError: null },
    });
    await this.audit.log({
      companyId,
      userId,
      action: 'INTEGRATION_TIKTOK_DISCONNECTED',
      entity: 'integration',
      entityId: integration.id,
      ip,
    });
  }
}
