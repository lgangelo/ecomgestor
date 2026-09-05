import { MercadoLivreOrdersSyncService } from './mercadolivre-orders-sync.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { MercadoLivreCredentialsService } from './mercadolivre-credentials.service';
import type { MercadoLivreConnectorFactory } from './mercadolivre-connector.factory';
import type { OrdersService } from '../../orders/orders.service';
import type { AppLoggerService } from '../../common/logger/app-logger.service';

const COMPANY_ID = 'company-1';
const CHANNEL_ID = 'channel-1';

function makeOrder(overrides: Partial<{ id: number; status: string }> = {}) {
  return {
    id: overrides.id ?? 1,
    status: overrides.status ?? 'cancelled',
    date_created: '2026-05-24T23:49:17.000-04:00',
    last_updated: '2026-05-25T00:11:20.000-04:00',
    order_items: [],
    payments: [],
    buyer: { id: 1 },
    seller: { id: 1 },
  };
}

function makeService(opts: { orderAlreadyKnown: boolean; results: ReturnType<typeof makeOrder>[]; total: number }) {
  const findUnique = jest.fn().mockResolvedValue(opts.orderAlreadyKnown ? { id: 'existing-order' } : null);
  const prisma = { client: { order: { findUnique } } };

  const credentialsService = {
    requireIntegration: jest.fn().mockResolvedValue({ id: 'integration-1', channelId: CHANNEL_ID }),
    getCredentials: jest.fn().mockResolvedValue({ userId: 'ml-user-1' }),
  };

  const searchOrders = jest.fn().mockResolvedValue({ results: opts.results, paging: { total: opts.total, offset: 0, limit: 50 } });
  const connectorFactory = {
    forCompany: jest.fn().mockResolvedValue({ client: { searchOrders }, integrationId: 'integration-1' }),
  };
  const ordersService = { importExternalOrder: jest.fn().mockResolvedValue({ orderId: 'order-1', created: true }) };
  const logger = { setContext: jest.fn(), log: jest.fn(), warn: jest.fn(), error: jest.fn() };

  const service = new MercadoLivreOrdersSyncService(
    prisma as unknown as PrismaService,
    credentialsService as unknown as MercadoLivreCredentialsService,
    connectorFactory as unknown as MercadoLivreConnectorFactory,
    ordersService as unknown as OrdersService,
    logger as unknown as AppLoggerService,
  );

  return { service, findUnique, searchOrders, ordersService };
}

describe('MercadoLivreOrdersSyncService.syncOrders', () => {
  it('pula pedido CANCELLED que ainda não existe no nosso banco (mesmo tratamento da TikTok)', async () => {
    const { service, ordersService } = makeService({
      orderAlreadyKnown: false,
      results: [makeOrder({ status: 'cancelled' })],
      total: 1,
    });

    const result = await service.syncOrders(COMPANY_ID, 'user-1');

    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(0);
    expect(ordersService.importExternalOrder).not.toHaveBeenCalled();
  });

  it('importa normalmente um pedido CANCELLED que JÁ existe (ex.: pago e cancelado depois)', async () => {
    const { service, ordersService } = makeService({
      orderAlreadyKnown: true,
      results: [makeOrder({ status: 'cancelled' })],
      total: 1,
    });

    const result = await service.syncOrders(COMPANY_ID, 'user-1');

    expect(result.skipped).toBe(0);
    expect(ordersService.importExternalOrder).toHaveBeenCalledTimes(1);
  });

  it('importa normalmente um pedido com status diferente de cancelled', async () => {
    const { service, ordersService } = makeService({
      orderAlreadyKnown: false,
      results: [makeOrder({ status: 'paid' })],
      total: 1,
    });

    const result = await service.syncOrders(COMPANY_ID, 'user-1');

    expect(result.skipped).toBe(0);
    expect(ordersService.importExternalOrder).toHaveBeenCalledTimes(1);
  });

  it('pagina por offset até cobrir paging.total', async () => {
    const { service, searchOrders } = makeService({
      orderAlreadyKnown: true,
      results: Array.from({ length: 50 }, (_, i) => makeOrder({ id: i, status: 'paid' })),
      total: 120,
    });

    await service.syncOrders(COMPANY_ID, 'user-1');

    // 120 pedidos / 50 por página = 3 chamadas (offset 0, 50, 100).
    expect(searchOrders).toHaveBeenCalledTimes(3);
    expect(searchOrders.mock.calls[0][0]).toMatchObject({ offset: '0' });
    expect(searchOrders.mock.calls[1][0]).toMatchObject({ offset: '50' });
    expect(searchOrders.mock.calls[2][0]).toMatchObject({ offset: '100' });
  });
});
