import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
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
export class TikTokOAuthService implements OnModuleInit {
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

  /**
   * `ensureReconcileSchedule` só era chamado no callback do OAuth (ao conectar/reconectar) —
   * mudar TIKTOK_RECONCILE_INTERVAL_MINUTES e reiniciar a API nunca reaplicava o novo intervalo
   * pra quem já estava conectado (confirmado: usuário mudou de 15 para 5 min, reiniciou, e o
   * job continuou rodando a cada 15). Reaplica o agendamento (com o valor ATUAL da config) pra
   * toda integração já conectada sempre que a API sobe, sem exigir desconectar/reconectar.
   */
  async onModuleInit(): Promise<void> {
    if (!this.isConfigured()) return;
    const intervalMinutes = this.configService.get<number>('tiktok.reconcileIntervalMinutes', { infer: true }) as number;
    const financeSyncIntervalMinutes = this.configService.get<number>('tiktok.financeSyncIntervalMinutes', {
      infer: true,
    }) as number;
    const connected = await this.prisma.client.integration.findMany({
      where: { provider: IntegrationProvider.TIKTOK_SHOP, status: IntegrationStatus.CONNECTED },
      select: { companyId: true },
    });
    for (const integration of connected) {
      await this.queue.ensureReconcileSchedule(integration.companyId, intervalMinutes);
      await this.queue.ensureFinanceSyncSchedule(integration.companyId, financeSyncIntervalMinutes);
    }
    if (connected.length > 0) {
      this.logger.log('tiktok_reconcile_schedules_reapplied', {
        operation: 'on_module_init',
        companiesCount: connected.length,
        intervalMinutes,
        financeSyncIntervalMinutes,
      });
    }
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

    if (!code) {
      throw new BadRequestException('Callback OAuth da TikTok Shop sem code.');
    }

    let companyId: string;
    let userId: string | null;
    // Preenchido só no caminho sem `state` (reautorização) — usado depois de trocar o code pelo
    // token, para verificar que a loja retornada é a MESMA já conectada antes de sobrescrever
    // qualquer credencial (ver comentário no bloco `else` abaixo e a verificação após o token).
    let reauthCandidate: { integrationId: string; existingShopId?: string } | null = null;

    if (state) {
      const stateKey = `tiktok:oauth-state:${state}`;
      const raw = await this.redis.client.get(stateKey);
      // Uso único: apaga imediatamente, antes de qualquer chamada de rede — uma segunda
      // requisição com o mesmo state (replay) nunca mais encontra o valor.
      await this.redis.client.del(stateKey);

      if (!raw) {
        throw new BadRequestException('State OAuth inválido, expirado ou já utilizado.');
      }
      ({ companyId, userId } = JSON.parse(raw) as OAuthStatePayload);
    } else {
      // Sem `state`: TikTok manda o vendedor direto pro nosso callback quando ele clica em
      // "Autorizar" no Seller Center (ex.: depois de o operador adicionar um escopo novo no
      // Partner Center — a própria TikTok instrui reautorizar assim, não pelo nosso botão
      // "Conectar"). Não passa por /connect, então não existe state pra validar.
      //
      // ACHADO REAL DE SEGURANÇA corrigido aqui: a versão anterior confiava cegamente em "a
      // integração TikTok mais recente" pra reidentificar a empresa — um atacante com sua
      // própria conta de vendedor TikTok conseguia montar a URL de autorização manualmente
      // (usando nosso client/app público) e, ao autorizar com a conta DELE, era redirecionado
      // pro nosso callback público sem `state`, sequestrando a integração já conectada (as
      // credenciais dele substituiriam as reais). A correção: tratar "a integração mais
      // recente" só como CANDIDATA — só aceitar depois de trocar o code e confirmar que a loja
      // retornada pela TikTok é a MESMA já conectada (comparando `shop_id`), nunca antes disso.
      // Também exige que a candidata já esteja CONECTADA — reautorização sem `state` só faz
      // sentido pra uma integração que já passou pelo fluxo normal com `state` alguma vez.
      const existing = await this.prisma.client.integration.findFirst({
        where: { provider: IntegrationProvider.TIKTOK_SHOP, status: IntegrationStatus.CONNECTED },
        orderBy: { updatedAt: 'desc' },
      });
      if (!existing) {
        throw new BadRequestException(
          'Callback OAuth da TikTok Shop sem state e sem conexão já ativa para reidentificar a empresa.',
        );
      }
      const existingCredentials = await this.credentialsService.getCredentials(existing.id);
      companyId = existing.companyId;
      userId = null;
      reauthCandidate = { integrationId: existing.id, existingShopId: existingCredentials?.shopId };
    }

    const appKey = this.configService.get<string>('tiktok.appKey', { infer: true }) as string;
    const appSecret = this.configService.get<string>('tiktok.appSecret', { infer: true }) as string;

    const token = await exchangeAuthorizationCode(appKey, appSecret, code);

    // O token OAuth de um Custom App nunca inclui shop_id/shop_cipher (confirmado em produção:
    // só traz seller_name/seller_base_region/open_id/granted_scopes) — "Get Authorized Shops"
    // (/authorization/{version}/shops) é a fonte oficial do shop_cipher (documentação do Partner
    // Center, código de erro 106013), exige o escopo "Shop Authorized Information"
    // (seller.authorization.info) tanto no app quanto no token (código 105005 sem ele).
    // Best-effort: uma falha nunca derruba a conexão, só fica sem shop_cipher (bloqueando as
    // chamadas de negócio até resolver).
    let shop: Awaited<ReturnType<typeof getAuthorizedShops>>[number] | undefined;
    try {
      const shopsClient = new TikTokClient({ appKey, appSecret, accessToken: token.accessToken });
      shop = (await getAuthorizedShops(shopsClient))[0];
    } catch (error) {
      this.logger.warn('tiktok_get_authorized_shops_failed', {
        operation: 'oauth_callback',
        errorMessage: (error as Error).message,
      });
    }

    if (reauthCandidate) {
      const newShopId = shop?.shopId ?? token.shopId;
      // Sem shop_id armazenado antes (nunca deveria acontecer pra uma integração já CONNECTED,
      // mas nunca assumir) OU a loja retornada é diferente da já conectada — rejeita antes de
      // gravar qualquer credencial nova. Isto é o que fecha o sequestro descrito acima: só uma
      // reautorização de VERDADE (mesma loja) passa daqui pra frente.
      if (!reauthCandidate.existingShopId || !newShopId || newShopId !== reauthCandidate.existingShopId) {
        this.logger.warn('tiktok_stateless_reauth_shop_mismatch', {
          operation: 'oauth_callback',
          expectedShopIdPresent: Boolean(reauthCandidate.existingShopId),
          receivedShopIdPresent: Boolean(newShopId),
        });
        throw new BadRequestException(
          'Callback OAuth da TikTok Shop sem state não corresponde à loja já conectada — conexão recusada.',
        );
      }
    }

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
    const financeSyncIntervalMinutes = this.configService.get<number>('tiktok.financeSyncIntervalMinutes', {
      infer: true,
    }) as number;
    await this.queue.ensureFinanceSyncSchedule(companyId, financeSyncIntervalMinutes);

    await this.audit.log({
      companyId,
      userId,
      action: 'INTEGRATION_TIKTOK_CONNECTED',
      entity: 'integration',
      entityId: integration.id,
      newValue: { storeName: shop?.shopName ?? token.sellerName, shopId: shop?.shopId ?? token.shopId },
      ip,
    });
    this.logger.log('tiktok_connected', { operation: 'oauth_callback', userId: userId ?? undefined });

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
