import { BadRequestException } from '@nestjs/common';
import { IntegrationProvider, IntegrationStatus } from '@ecommerce-manager/database';
import { exchangeAuthorizationCode, getAuthorizedShops } from '@ecommerce-manager/integrations';
import { TikTokOAuthService } from './tiktok-oauth.service';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { RedisService } from '../../common/redis/redis.service';
import type { TikTokCredentialsService } from './tiktok-credentials.service';
import type { TikTokQueueService } from '../../queue/tiktok-queue.service';
import type { AuditService } from '../../audit/audit.service';
import type { AppLoggerService } from '../../common/logger/app-logger.service';

jest.mock('@ecommerce-manager/integrations', () => ({
  buildAuthorizeUrl: jest.fn(),
  exchangeAuthorizationCode: jest.fn(),
  getAuthorizedShops: jest.fn(),
  TikTokClient: jest.fn().mockImplementation(() => ({})),
}));

const CONFIG_VALUES: Record<string, unknown> = {
  webAppUrl: 'https://app.example.com',
  'tiktok.enabled': true,
  'tiktok.appKey': 'app-key',
  'tiktok.appSecret': 'app-secret',
  'tiktok.serviceId': 'service-id',
  'tiktok.reconcileIntervalMinutes': 15,
  'tiktok.financeSyncIntervalMinutes': 60,
};

function makeService(opts: {
  candidateIntegration?: { id: string; companyId: string; status: IntegrationStatus } | null;
  existingShopId?: string;
}) {
  const configService = { get: jest.fn((key: string) => CONFIG_VALUES[key]) };

  const salesChannelUpsert = jest.fn().mockResolvedValue({ id: 'channel-1' });
  const integrationUpdate = jest.fn();
  const integrationFindFirst = jest.fn().mockResolvedValue(opts.candidateIntegration ?? null);
  const prisma = {
    client: {
      integration: { findFirst: integrationFindFirst, update: integrationUpdate },
      salesChannel: { upsert: salesChannelUpsert },
    },
  };

  const redis = { client: { get: jest.fn().mockResolvedValue(null), del: jest.fn() } };

  const getCredentials = jest.fn().mockResolvedValue(opts.existingShopId ? { shopId: opts.existingShopId } : null);
  const saveCredentials = jest.fn();
  const getOrCreateIntegration = jest.fn().mockResolvedValue({ id: opts.candidateIntegration?.id ?? 'integration-1' });
  const credentialsService = { getCredentials, saveCredentials, getOrCreateIntegration };

  const queue = { ensureReconcileSchedule: jest.fn(), ensureFinanceSyncSchedule: jest.fn() };
  const audit = { log: jest.fn() };
  const logger = { setContext: jest.fn(), log: jest.fn(), warn: jest.fn(), error: jest.fn() };

  const service = new TikTokOAuthService(
    configService as unknown as ConfigService,
    prisma as unknown as PrismaService,
    redis as unknown as RedisService,
    credentialsService as unknown as TikTokCredentialsService,
    queue as unknown as TikTokQueueService,
    audit as unknown as AuditService,
    logger as unknown as AppLoggerService,
  );

  return { service, saveCredentials, integrationFindFirst, logger };
}

describe('TikTokOAuthService.handleCallback — callback sem state (ACHADO REAL DE SEGURANÇA corrigido)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejeita quando não existe nenhuma integração TikTok já CONNECTED pra reidentificar (nunca aceita candidata desconectada)', async () => {
    const { service, integrationFindFirst } = makeService({ candidateIntegration: null });

    await expect(service.handleCallback(undefined, 'code-123')).rejects.toThrow(BadRequestException);

    // Confirma que a busca já filtra por status CONNECTED, não "a mais recente" de qualquer status.
    expect(integrationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { provider: IntegrationProvider.TIKTOK_SHOP, status: IntegrationStatus.CONNECTED } }),
    );
  });

  it('rejeita e NUNCA salva credenciais quando a loja retornada é DIFERENTE da já conectada (o sequestro que o achado descreveu)', async () => {
    const { service, saveCredentials, logger } = makeService({
      candidateIntegration: { id: 'integration-1', companyId: 'company-1', status: IntegrationStatus.CONNECTED },
      existingShopId: 'shop-legitimo',
    });
    (exchangeAuthorizationCode as jest.Mock).mockResolvedValue({
      accessToken: 'atk',
      refreshToken: 'rtk',
      accessTokenExpiresAt: new Date(),
      refreshTokenExpiresAt: new Date(),
      shopId: undefined,
      sellerName: 'Loja do Atacante',
    });
    (getAuthorizedShops as jest.Mock).mockResolvedValue([{ shopId: 'shop-DO-ATACANTE', shopName: 'Loja do Atacante' }]);

    await expect(service.handleCallback(undefined, 'code-do-atacante')).rejects.toThrow(BadRequestException);

    expect(saveCredentials).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('tiktok_stateless_reauth_shop_mismatch', expect.any(Object));
  });

  it('rejeita quando nunca havia shop_id salvo antes, mesmo a integração estando CONNECTED (nunca confia numa candidata sem histórico pra comparar)', async () => {
    const { service, saveCredentials } = makeService({
      candidateIntegration: { id: 'integration-1', companyId: 'company-1', status: IntegrationStatus.CONNECTED },
      existingShopId: undefined,
    });
    (exchangeAuthorizationCode as jest.Mock).mockResolvedValue({
      accessToken: 'atk',
      refreshToken: 'rtk',
      accessTokenExpiresAt: new Date(),
      refreshTokenExpiresAt: new Date(),
    });
    (getAuthorizedShops as jest.Mock).mockResolvedValue([{ shopId: 'shop-qualquer', shopName: 'Loja' }]);

    await expect(service.handleCallback(undefined, 'code-123')).rejects.toThrow(BadRequestException);
    expect(saveCredentials).not.toHaveBeenCalled();
  });

  it('aceita e salva credenciais quando a loja retornada é A MESMA já conectada (reautorização legítima da própria TikTok preservada)', async () => {
    const { service, saveCredentials } = makeService({
      candidateIntegration: { id: 'integration-1', companyId: 'company-1', status: IntegrationStatus.CONNECTED },
      existingShopId: 'shop-real-123',
    });
    (exchangeAuthorizationCode as jest.Mock).mockResolvedValue({
      accessToken: 'atk-novo',
      refreshToken: 'rtk-novo',
      accessTokenExpiresAt: new Date(),
      refreshTokenExpiresAt: new Date(),
    });
    (getAuthorizedShops as jest.Mock).mockResolvedValue([{ shopId: 'shop-real-123', shopName: 'Venticelli Bolsas' }]);

    await service.handleCallback(undefined, 'code-de-reautorizacao');

    expect(saveCredentials).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({ shopId: 'shop-real-123', accessToken: 'atk-novo' }),
    );
  });
});
