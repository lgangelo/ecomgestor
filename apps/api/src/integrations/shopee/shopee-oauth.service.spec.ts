import { BadRequestException } from '@nestjs/common';
import { IntegrationProvider, IntegrationStatus } from '@ecommerce-manager/database';
import { exchangeShopeeAuthorizationCode } from '@ecommerce-manager/integrations';
import { ShopeeOAuthService } from './shopee-oauth.service';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { RedisService } from '../../common/redis/redis.service';
import type { ShopeeCredentialsService } from './shopee-credentials.service';
import type { AuditService } from '../../audit/audit.service';
import type { AppLoggerService } from '../../common/logger/app-logger.service';

jest.mock('@ecommerce-manager/integrations', () => ({
  buildShopeeAuthorizeUrl: jest.fn(),
  exchangeShopeeAuthorizationCode: jest.fn(),
}));

const CONFIG_VALUES: Record<string, unknown> = {
  webAppUrl: 'https://app.example.com',
  'shopee.enabled': true,
  'shopee.partnerId': 'partner-id',
  'shopee.partnerKey': 'partner-key',
  'shopee.sandbox': false,
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

  const audit = { log: jest.fn() };
  const logger = { setContext: jest.fn(), log: jest.fn(), warn: jest.fn(), error: jest.fn() };

  const service = new ShopeeOAuthService(
    configService as unknown as ConfigService,
    prisma as unknown as PrismaService,
    redis as unknown as RedisService,
    credentialsService as unknown as ShopeeCredentialsService,
    audit as unknown as AuditService,
    logger as unknown as AppLoggerService,
  );

  return { service, saveCredentials, integrationFindFirst, logger };
}

describe('ShopeeOAuthService.handleCallback — callback sem state (ACHADO REAL DE SEGURANÇA corrigido)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejeita quando não existe nenhuma integração Shopee já CONNECTED pra reidentificar', async () => {
    const { service, integrationFindFirst } = makeService({ candidateIntegration: null });

    await expect(service.handleCallback(undefined, 'code-123', 'shop-999', undefined)).rejects.toThrow(BadRequestException);

    expect(integrationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { provider: IntegrationProvider.SHOPEE, status: IntegrationStatus.CONNECTED } }),
    );
  });

  it('rejeita e NUNCA troca o code quando o shop_id do redirect é DIFERENTE do já conectado', async () => {
    const { service, saveCredentials, logger } = makeService({
      candidateIntegration: { id: 'integration-1', companyId: 'company-1', status: IntegrationStatus.CONNECTED },
      existingShopId: 'shop-legitimo',
    });

    await expect(service.handleCallback(undefined, 'code-do-atacante', 'shop-DO-ATACANTE', undefined)).rejects.toThrow(
      BadRequestException,
    );

    expect(saveCredentials).not.toHaveBeenCalled();
    expect(exchangeShopeeAuthorizationCode).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('shopee_stateless_reauth_shop_mismatch', expect.any(Object));
  });

  it('rejeita quando nunca havia shop_id salvo antes, mesmo a integração estando CONNECTED', async () => {
    const { service, saveCredentials } = makeService({
      candidateIntegration: { id: 'integration-1', companyId: 'company-1', status: IntegrationStatus.CONNECTED },
      existingShopId: undefined,
    });

    await expect(service.handleCallback(undefined, 'code-123', 'shop-qualquer', undefined)).rejects.toThrow(
      BadRequestException,
    );
    expect(saveCredentials).not.toHaveBeenCalled();
  });

  it('aceita e salva credenciais quando o shop_id do redirect é O MESMO já conectado', async () => {
    const { service, saveCredentials } = makeService({
      candidateIntegration: { id: 'integration-1', companyId: 'company-1', status: IntegrationStatus.CONNECTED },
      existingShopId: 'shop-real-123',
    });
    (exchangeShopeeAuthorizationCode as jest.Mock).mockResolvedValue({
      accessToken: 'atk-novo',
      refreshToken: 'rtk-novo',
      accessTokenExpiresAt: new Date(),
      refreshTokenExpiresAt: new Date(),
      shopId: 'shop-real-123',
    });

    await service.handleCallback(undefined, 'code-de-reautorizacao', 'shop-real-123', undefined);

    expect(saveCredentials).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({ shopId: 'shop-real-123', accessToken: 'atk-novo' }),
    );
  });
});
