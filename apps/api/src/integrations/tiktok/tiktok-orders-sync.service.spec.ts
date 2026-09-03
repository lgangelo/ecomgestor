import { TikTokOrdersSyncService } from './tiktok-orders-sync.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { TikTokCredentialsService } from './tiktok-credentials.service';
import type { TikTokConnectorFactory } from './tiktok-connector.factory';
import type { OrdersService } from '../../orders/orders.service';
import type { TikTokFinanceSyncService } from './tiktok-finance-sync.service';
import type { AppLoggerService } from '../../common/logger/app-logger.service';

const COMPANY_ID = 'company-1';
const CHANNEL_ID = 'channel-1';
const OLD_CHECKPOINT = '2026-08-01T00:00:00.000Z';

function makeService(opts: { alwaysHasNextPage: boolean }) {
  const integrationUpdate = jest.fn();
  const loggerWarn = jest.fn();

  const prisma = {
    client: {
      integration: { update: integrationUpdate },
      order: { findUnique: jest.fn().mockResolvedValue(null) },
    },
  };

  const credentialsService = {
    requireIntegration: jest.fn().mockResolvedValue({
      id: 'integration-1',
      channelId: CHANNEL_ID,
      syncCheckpoints: { ordersSyncAt: OLD_CHECKPOINT },
    }),
  };

  // Sempre devolve `nextPageToken` truthy — simula um backlog maior que MAX_PAGES*pageSize.
  const getOrders = jest.fn().mockResolvedValue({
    items: [],
    nextPageToken: opts.alwaysHasNextPage ? 'next-page' : undefined,
  });
  const connectorFactory = { forCompany: jest.fn().mockResolvedValue({ connector: { getOrders } }) };
  const ordersService = { importExternalOrder: jest.fn() };
  const financeSync = { syncOrderFee: jest.fn() };
  const logger = { setContext: jest.fn(), log: jest.fn(), warn: loggerWarn, error: loggerWarn };

  const service = new TikTokOrdersSyncService(
    prisma as unknown as PrismaService,
    credentialsService as unknown as TikTokCredentialsService,
    connectorFactory as unknown as TikTokConnectorFactory,
    ordersService as unknown as OrdersService,
    financeSync as unknown as TikTokFinanceSyncService,
    logger as unknown as AppLoggerService,
  );

  return { service, integrationUpdate, getOrders, loggerWarn };
}

describe('TikTokOrdersSyncService.syncOrders — nao perde backlog maior que MAX_PAGES', () => {
  it('quando o backlog excede o limite de paginas, NAO avanca o checkpoint (mantem o antigo)', async () => {
    const { service, integrationUpdate, getOrders, loggerWarn } = makeService({ alwaysHasNextPage: true });

    await service.syncOrders(COMPANY_ID, 'user-1');

    // Parou exatamente em MAX_PAGES (20), nunca tentou seguir infinitamente.
    expect(getOrders).toHaveBeenCalledTimes(20);
    expect(loggerWarn).toHaveBeenCalledWith('tiktok_order_sync_truncated', expect.any(Object));

    const updateCall = integrationUpdate.mock.calls[0][0];
    // O checkpoint gravado precisa continuar sendo o ANTIGO — nunca avançar pra "agora", senão o
    // backlog além da pagina 20 nunca mais seria buscado de novo.
    expect(updateCall.data.syncCheckpoints.ordersSyncAt).toBe(OLD_CHECKPOINT);
  });

  it('quando o backlog cabe dentro do limite de paginas, avanca o checkpoint normalmente', async () => {
    const { service, integrationUpdate, getOrders } = makeService({ alwaysHasNextPage: false });

    await service.syncOrders(COMPANY_ID, 'user-1');

    // Só 1 página — nextPageToken vem vazio, o laço para naturalmente.
    expect(getOrders).toHaveBeenCalledTimes(1);

    const updateCall = integrationUpdate.mock.calls[0][0];
    expect(updateCall.data.syncCheckpoints.ordersSyncAt).not.toBe(OLD_CHECKPOINT);
  });
});
