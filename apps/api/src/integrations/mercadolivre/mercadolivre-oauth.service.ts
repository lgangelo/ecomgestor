import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelType, IntegrationProvider, IntegrationStatus } from '@ecommerce-manager/database';
import {
  buildMercadoLivreAuthorizeUrl,
  exchangeMercadoLivreAuthorizationCode,
  generateMercadoLivrePkcePair,
} from '@ecommerce-manager/integrations';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { AuditService } from '../../audit/audit.service';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { MercadoLivreCredentialsService } from './mercadolivre-credentials.service';

const STATE_TTL_SECONDS = 600;

interface OAuthStatePayload {
  companyId: string;
  userId: string;
  /** PKCE (RFC 7636) — CONFIRMADO exigido pela aplicação real do usuário no painel do Mercado
   * Livre ("PKCE necessário" marcado). O verifier nunca aparece na URL de autorização (só o
   * challenge derivado dele) — precisa ficar guardado aqui, ao lado do `state`, pra ser
   * recuperado no callback e enviado na troca do code por token. */
  codeVerifier: string;
}

/**
 * OAuth do Mercado Livre — mesmo desenho de `shopee-oauth.service.ts`/`tiktok-oauth.service.ts`
 * (state de uso único via Redis, nunca confia no cookie de sessão no callback, que é uma
 * navegação de topo vinda de mercadolivre.com.br). Diferente da Shopee: aqui o `state` É
 * repassado no callback (comportamento OAuth2 padrão, ver mercadolivre.auth.ts), então a
 * reidentificação "pela integração mais recente" só entra como último recurso, nunca o caminho
 * esperado.
 */
@Injectable()
export class MercadoLivreOAuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly credentialsService: MercadoLivreCredentialsService,
    private readonly audit: AuditService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext('MercadoLivreOAuth');
  }

  isConfigured(): boolean {
    return Boolean(this.configService.get<boolean>('mercadoLivre.enabled', { infer: true }));
  }

  private requireConfigured(): void {
    if (!this.isConfigured()) {
      throw new BadRequestException(
        'Mercado Livre não configurado. Configure MERCADOLIVRE_CLIENT_ID e MERCADOLIVRE_CLIENT_SECRET para conectar sua conta.',
      );
    }
  }

  async buildConnectUrl(companyId: string, userId: string): Promise<string> {
    this.requireConfigured();
    const clientId = this.configService.get<string>('mercadoLivre.clientId', { infer: true }) as string;
    const redirectUri = this.configService.get<string>('mercadoLivre.redirectUri', { infer: true }) as string;

    const state = randomBytes(32).toString('hex');
    const { codeVerifier, codeChallenge } = generateMercadoLivrePkcePair();
    const payload: OAuthStatePayload = { companyId, userId, codeVerifier };
    await this.redis.client.set(`mercadolivre:oauth-state:${state}`, JSON.stringify(payload), 'EX', STATE_TTL_SECONDS);

    return buildMercadoLivreAuthorizeUrl({ clientId, redirectUri, state, codeChallenge });
  }

  async handleCallback(state: string | undefined, code: string | undefined, ip?: string): Promise<{ webAppUrl: string }> {
    this.requireConfigured();
    const webAppUrl = this.configService.get<string>('webAppUrl')!;

    if (!code) {
      throw new BadRequestException('Callback OAuth do Mercado Livre sem code.');
    }

    let companyId: string;
    let userId: string | null;
    let codeVerifier: string;

    if (state) {
      const stateKey = `mercadolivre:oauth-state:${state}`;
      const raw = await this.redis.client.get(stateKey);
      await this.redis.client.del(stateKey);

      if (!raw) {
        throw new BadRequestException('State OAuth inválido, expirado ou já utilizado.');
      }
      ({ companyId, userId, codeVerifier } = JSON.parse(raw) as OAuthStatePayload);
    } else {
      // Sem state não tem como recuperar o code_verifier do PKCE (nunca exposto na URL) —
      // diferente de Shopee/TikTok, aqui não existe saída provisória possível: a aplicação do
      // Mercado Livre exige PKCE, e sem o verifier a troca do code por token sempre falha. O
      // Mercado Livre DEVERIA sempre devolver o `state` (padrão OAuth2) — chegar aqui indica
      // algo fora do esperado, nunca um caminho válido a contornar.
      throw new BadRequestException(
        'Callback OAuth do Mercado Livre sem state — não é possível recuperar o code_verifier do PKCE para concluir a conexão.',
      );
    }

    const clientId = this.configService.get<string>('mercadoLivre.clientId', { infer: true }) as string;
    const clientSecret = this.configService.get<string>('mercadoLivre.clientSecret', { infer: true }) as string;
    const redirectUri = this.configService.get<string>('mercadoLivre.redirectUri', { infer: true }) as string;

    const token = await exchangeMercadoLivreAuthorizationCode({ clientId, clientSecret, code, redirectUri, codeVerifier });

    const integration = await this.credentialsService.getOrCreateIntegration(companyId);
    await this.credentialsService.saveCredentials(integration.id, {
      userId: token.userId,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      accessTokenExpiresAt: token.accessTokenExpiresAt,
    });

    const storeName = token.userId;
    const channel = await this.prisma.client.salesChannel.upsert({
      where: { companyId_type_name: { companyId, type: ChannelType.MERCADO_LIVRE, name: 'Mercado Livre' } },
      create: { companyId, type: ChannelType.MERCADO_LIVRE, name: 'Mercado Livre', isManual: false },
      update: {},
    });

    await this.prisma.client.integration.update({
      where: { id: integration.id },
      data: {
        channelId: channel.id,
        provider: IntegrationProvider.MERCADO_LIVRE,
        status: IntegrationStatus.CONNECTED,
        storeName,
        lastError: null,
      },
    });

    await this.audit.log({
      companyId,
      userId,
      action: 'INTEGRATION_MERCADOLIVRE_CONNECTED',
      entity: 'integration',
      entityId: integration.id,
      newValue: { storeName },
      ip,
    });
    this.logger.log('mercadolivre_connected', { operation: 'oauth_callback', userId: userId ?? undefined });

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
      action: 'INTEGRATION_MERCADOLIVRE_DISCONNECTED',
      entity: 'integration',
      entityId: integration.id,
      ip,
    });
  }
}
