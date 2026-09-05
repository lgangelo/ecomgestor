import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelType, IntegrationProvider, IntegrationStatus } from '@ecommerce-manager/database';
import { buildShopeeAuthorizeUrl, exchangeShopeeAuthorizationCode } from '@ecommerce-manager/integrations';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { AuditService } from '../../audit/audit.service';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { ShopeeCredentialsService } from './shopee-credentials.service';

const STATE_TTL_SECONDS = 600;

interface OAuthStatePayload {
  companyId: string;
  userId: string;
}

/**
 * OAuth da Shopee — mesmo desenho de `tiktok-oauth.service.ts` (state de uso único via Redis,
 * nunca confia no cookie de sessão no callback, que é uma navegação de topo vinda de
 * shopeemobile.com). Diferente da TikTok, a Shopee manda `shop_id` (ou `main_account_id`) direto
 * no redirect do callback — CONFIRMADO pela pesquisa (docs/integrations/shopee.md, seção 1),
 * então não precisa de uma chamada equivalente a "Get Authorized Shops".
 */
@Injectable()
export class ShopeeOAuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly credentialsService: ShopeeCredentialsService,
    private readonly audit: AuditService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext('ShopeeOAuth');
  }

  isConfigured(): boolean {
    return Boolean(this.configService.get<boolean>('shopee.enabled', { infer: true }));
  }

  private requireConfigured(): void {
    if (!this.isConfigured()) {
      throw new BadRequestException(
        'Shopee não configurada. Configure SHOPEE_PARTNER_ID e SHOPEE_PARTNER_KEY para conectar sua loja.',
      );
    }
  }

  async buildConnectUrl(companyId: string, userId: string): Promise<string> {
    this.requireConfigured();
    const partnerId = this.configService.get<string>('shopee.partnerId', { infer: true }) as string;
    const partnerKey = this.configService.get<string>('shopee.partnerKey', { infer: true }) as string;
    const redirectUri = this.configService.get<string>('shopee.redirectUri', { infer: true }) as string;
    const sandbox = this.configService.get<boolean>('shopee.sandbox', { infer: true }) as boolean;

    const state = randomBytes(32).toString('hex');
    const payload: OAuthStatePayload = { companyId, userId };
    await this.redis.client.set(`shopee:oauth-state:${state}`, JSON.stringify(payload), 'EX', STATE_TTL_SECONDS);

    // NÃO CONFIRMADO: se a Shopee de fato repassa nosso `state` de volta no redirect do
    // callback (a TikTok repassa; nenhuma fonte consultada confirmou o comportamento
    // equivalente para a Shopee) — se não repassar, o `state` guardado acima fica órfão e o
    // callback precisa de outra forma de reidentificar a empresa (mesma saída provisória já
    // usada para a TikTok quando o `state` está ausente: reidentificar pela integração mais
    // recente, válida só enquanto houver uma única empresa usando esta integração).
    return buildShopeeAuthorizeUrl({ partnerId, partnerKey, redirectUri, sandbox });
  }

  async handleCallback(
    state: string | undefined,
    code: string | undefined,
    shopId: string | undefined,
    mainAccountId: string | undefined,
    ip?: string,
  ): Promise<{ webAppUrl: string }> {
    this.requireConfigured();
    const webAppUrl = this.configService.get<string>('webAppUrl')!;

    if (!code) {
      throw new BadRequestException('Callback OAuth da Shopee sem code.');
    }

    let companyId: string;
    let userId: string | null;

    if (state) {
      const stateKey = `shopee:oauth-state:${state}`;
      const raw = await this.redis.client.get(stateKey);
      await this.redis.client.del(stateKey);

      if (!raw) {
        throw new BadRequestException('State OAuth inválido, expirado ou já utilizado.');
      }
      ({ companyId, userId } = JSON.parse(raw) as OAuthStatePayload);
    } else {
      // ACHADO REAL DE SEGURANÇA corrigido (mesmo problema já corrigido em
      // `tiktok-oauth.service.ts` — ver o comentário lá para o cenário de ataque completo): a
      // versão anterior confiava cegamente em "a integração Shopee mais recente" pra
      // reidentificar a empresa, sem provar que quem chamou o callback é quem iniciou o fluxo.
      // A Shopee, diferente da TikTok, já manda `shop_id`/`main_account_id` direto no redirect —
      // por isso dá pra verificar ANTES de trocar o code: só aceita reautorização sem `state`
      // quando (a) já existe uma integração CONNECTED e (b) o shop_id/merchant_id retornado bate
      // com o já salvo.
      const existing = await this.prisma.client.integration.findFirst({
        where: { provider: IntegrationProvider.SHOPEE, status: IntegrationStatus.CONNECTED },
        orderBy: { updatedAt: 'desc' },
      });
      if (!existing) {
        throw new BadRequestException(
          'Callback OAuth da Shopee sem state e sem conexão já ativa para reidentificar a empresa.',
        );
      }
      const existingCredentials = await this.credentialsService.getCredentials(existing.id);
      const existingIdentity = existingCredentials?.shopId ?? existingCredentials?.merchantId;
      const newIdentity = shopId ?? mainAccountId;
      if (!existingIdentity || !newIdentity || newIdentity !== existingIdentity) {
        this.logger.warn('shopee_stateless_reauth_shop_mismatch', {
          operation: 'oauth_callback',
          expectedIdentityPresent: Boolean(existingIdentity),
          receivedIdentityPresent: Boolean(newIdentity),
        });
        throw new BadRequestException(
          'Callback OAuth da Shopee sem state não corresponde à loja já conectada — conexão recusada.',
        );
      }
      companyId = existing.companyId;
      userId = null;
    }

    const partnerId = this.configService.get<string>('shopee.partnerId', { infer: true }) as string;
    const partnerKey = this.configService.get<string>('shopee.partnerKey', { infer: true }) as string;
    const sandbox = this.configService.get<boolean>('shopee.sandbox', { infer: true }) as boolean;

    const token = await exchangeShopeeAuthorizationCode({
      partnerId,
      partnerKey,
      code,
      shopId,
      mainAccountId,
      sandbox,
    });

    const integration = await this.credentialsService.getOrCreateIntegration(companyId);
    await this.credentialsService.saveCredentials(integration.id, {
      shopId: token.shopId ?? shopId,
      merchantId: token.merchantId ?? mainAccountId,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      accessTokenExpiresAt: token.accessTokenExpiresAt,
      refreshTokenExpiresAt: token.refreshTokenExpiresAt,
    });

    const storeName = token.shopId ?? shopId ?? token.merchantId ?? mainAccountId ?? 'Shopee';
    const channel = await this.prisma.client.salesChannel.upsert({
      where: { companyId_type_name: { companyId, type: ChannelType.SHOPEE, name: 'Shopee' } },
      create: { companyId, type: ChannelType.SHOPEE, name: 'Shopee', isManual: false },
      update: {},
    });

    await this.prisma.client.integration.update({
      where: { id: integration.id },
      data: {
        channelId: channel.id,
        provider: IntegrationProvider.SHOPEE,
        status: IntegrationStatus.CONNECTED,
        storeName,
        lastError: null,
      },
    });

    await this.audit.log({
      companyId,
      userId,
      action: 'INTEGRATION_SHOPEE_CONNECTED',
      entity: 'integration',
      entityId: integration.id,
      newValue: { storeName },
      ip,
    });
    this.logger.log('shopee_connected', { operation: 'oauth_callback', userId: userId ?? undefined });

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
      action: 'INTEGRATION_SHOPEE_DISCONNECTED',
      entity: 'integration',
      entityId: integration.id,
      ip,
    });
  }
}
