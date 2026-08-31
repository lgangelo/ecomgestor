import type { ExternalOrder } from '@ecommerce-manager/integrations';
import type { PrismaService } from '../common/prisma/prisma.service';
import { InventoryLedgerService } from '../inventory/ledger.service';
import { AppLoggerService } from '../common/logger/app-logger.service';
import { OrdersService } from './orders.service';
import { FakeDb } from './test-support/fake-prisma';

const COMPANY_ID = 'company-1';
const CHANNEL_ID = 'channel-tiktok';

function buildExternalOrder(overrides: Partial<ExternalOrder> = {}): ExternalOrder {
  return {
    externalOrderId: 'TT-1001',
    status: 'AWAITING_SHIPMENT',
    internalStatus: 'PAID',
    customerName: 'Comprador TikTok',
    orderDate: new Date('2026-08-01T10:00:00Z'),
    items: [{ externalSku: 'ext-sku-1', quantity: 2, unitPrice: '50.00' }],
    raw: {},
    ...overrides,
  };
}

function makeService(db: FakeDb) {
  const prismaService = db.asPrismaService();
  const ledger = new InventoryLedgerService();
  const service = new OrdersService(prismaService as unknown as PrismaService, ledger, new AppLoggerService());
  return { service, db };
}

describe('OrdersService — sincronização externa (Fase 3)', () => {
  it('importa um pedido novo pré-envio: reserva estoque (nunca baixa) para os itens mapeados', async () => {
    const db = new FakeDb();
    db.addVariant({ id: 'variant-1', sku: 'SKU-1', productName: 'Produto 1', cost: 10 });
    db.inventories[0].onHand = 5;
    db.addMapping({ channelId: CHANNEL_ID, externalSku: 'ext-sku-1', variantId: 'variant-1', syncStatus: 'CONFIRMED' });
    const { service } = makeService(db);

    const result = await service.importExternalOrder(COMPANY_ID, CHANNEL_ID, 'user-1', buildExternalOrder());

    expect(result.created).toBe(true);
    const order = db.orders.find((o) => o.id === result.orderId)!;
    expect(order.status).toBe('PAID');
    expect(order.integrationSyncStatus).toBe('OK');
    expect(db.inventories[0].onHand).toBe(5); // pré-envio nunca baixa, só reserva
    expect(db.inventories[0].reserved).toBe(2);
  });

  it('importação histórica de pedido já SHIPPED baixa estoque direto, sem passar por reserva intermediária', async () => {
    const db = new FakeDb();
    db.addVariant({ id: 'variant-1', sku: 'SKU-1', productName: 'Produto 1', cost: 10 });
    db.inventories[0].onHand = 5;
    db.addMapping({ channelId: CHANNEL_ID, externalSku: 'ext-sku-1', variantId: 'variant-1', syncStatus: 'CONFIRMED' });
    const { service } = makeService(db);

    const result = await service.importExternalOrder(
      COMPANY_ID,
      CHANNEL_ID,
      'user-1',
      buildExternalOrder({ status: 'IN_TRANSIT', internalStatus: 'SHIPPED', externalOrderId: 'TT-1002' }),
    );

    const order = db.orders.find((o) => o.id === result.orderId)!;
    expect(order.status).toBe('SHIPPED');
    expect(db.inventories[0].onHand).toBe(3); // baixou direto (5 - 2), nunca ficou reservado
    expect(db.inventories[0].reserved).toBe(0);
  });

  it('pedido com SKU sem vínculo: cria com REQUIRES_MAPPING e não movimenta estoque desse item', async () => {
    const db = new FakeDb();
    const { service } = makeService(db);

    const result = await service.importExternalOrder(
      COMPANY_ID,
      CHANNEL_ID,
      'user-1',
      buildExternalOrder({ externalOrderId: 'TT-1003' }),
    );

    const order = db.orders.find((o) => o.id === result.orderId)!;
    expect(order.integrationSyncStatus).toBe('REQUIRES_MAPPING');
    expect(order.integrationIssue).toMatch(/sem vínculo/i);
    const item = db.orderItems.find((i) => i.orderId === order.id)!;
    expect(item.variantId).toBeNull();
    expect(item.externalSku).toBe('ext-sku-1');
    expect(db.inventories).toHaveLength(0); // nenhum InventoryMovement/linha criada para o item pendente
  });

  it('reprocessar pedido depois do vínculo criado aplica o efeito de estoque pendente e volta a OK', async () => {
    const db = new FakeDb();
    const { service } = makeService(db);
    const importResult = await service.importExternalOrder(
      COMPANY_ID,
      CHANNEL_ID,
      'user-1',
      buildExternalOrder({ externalOrderId: 'TT-1004', internalStatus: 'PAID' }),
    );

    // Usuário resolve o vínculo depois da importação.
    db.addVariant({ id: 'variant-1', sku: 'SKU-1', productName: 'Produto 1', cost: 10 });
    db.inventories[0].onHand = 10;
    db.addMapping({ channelId: CHANNEL_ID, externalSku: 'ext-sku-1', variantId: 'variant-1', syncStatus: 'CONFIRMED' });

    const reprocessResult = await service.reprocessOrder(importResult.orderId, COMPANY_ID, 'user-1');

    expect(reprocessResult.resolvedItems).toBe(1);
    const order = db.orders.find((o) => o.id === importResult.orderId)!;
    expect(order.integrationSyncStatus).toBe('OK');
    expect(order.integrationIssue).toBeNull();
    expect(db.inventories[0].reserved).toBe(2); // pedido ainda em PAID (pré-envio) -> reserva
  });

  it('idempotência: importar o mesmo externalOrderId de novo atualiza em vez de duplicar', async () => {
    const db = new FakeDb();
    db.addVariant({ id: 'variant-1', sku: 'SKU-1', productName: 'Produto 1', cost: 10 });
    db.inventories[0].onHand = 10;
    db.addMapping({ channelId: CHANNEL_ID, externalSku: 'ext-sku-1', variantId: 'variant-1', syncStatus: 'CONFIRMED' });
    const { service } = makeService(db);

    const first = await service.importExternalOrder(COMPANY_ID, CHANNEL_ID, 'user-1', buildExternalOrder());
    const second = await service.importExternalOrder(
      COMPANY_ID,
      CHANNEL_ID,
      'user-1',
      buildExternalOrder({ internalStatus: 'SHIPPED', status: 'IN_TRANSIT', externalUpdatedAt: new Date('2026-08-02T00:00:00Z') }),
    );

    expect(second.created).toBe(false);
    expect(second.orderId).toBe(first.orderId);
    expect(db.orders).toHaveLength(1);
    expect(db.orders[0].status).toBe('SHIPPED');
  });

  it('ignora atualização externa fora de ordem (regressiva) sem regredir o status nem mexer em estoque', async () => {
    const db = new FakeDb();
    db.addVariant({ id: 'variant-1', sku: 'SKU-1', productName: 'Produto 1', cost: 10 });
    db.inventories[0].onHand = 10;
    db.addMapping({ channelId: CHANNEL_ID, externalSku: 'ext-sku-1', variantId: 'variant-1', syncStatus: 'CONFIRMED' });
    const { service } = makeService(db);

    const created = await service.importExternalOrder(
      COMPANY_ID,
      CHANNEL_ID,
      'user-1',
      buildExternalOrder({ internalStatus: 'SHIPPED', status: 'IN_TRANSIT' }),
    );
    const onHandAfterShip = db.inventories[0].onHand;

    const result = await service.applyExternalStatusUpdate(
      COMPANY_ID,
      created.orderId,
      null,
      buildExternalOrder({ internalStatus: 'PAID', status: 'AWAITING_SHIPMENT' }),
    );

    expect(result.applied).toBe(false);
    expect(db.orders.find((o) => o.id === created.orderId)!.status).toBe('SHIPPED');
    expect(db.inventories[0].onHand).toBe(onHandAfterShip); // nenhuma baixa/estorno adicional
  });

  it('aplica atualização externa pulando estágios (PAID -> SHIPPED direto) baixando estoque uma única vez', async () => {
    const db = new FakeDb();
    db.addVariant({ id: 'variant-1', sku: 'SKU-1', productName: 'Produto 1', cost: 10 });
    db.inventories[0].onHand = 10;
    db.addMapping({ channelId: CHANNEL_ID, externalSku: 'ext-sku-1', variantId: 'variant-1', syncStatus: 'CONFIRMED' });
    const { service } = makeService(db);

    const created = await service.importExternalOrder(COMPANY_ID, CHANNEL_ID, 'user-1', buildExternalOrder());
    expect(db.inventories[0].reserved).toBe(2);

    const result = await service.applyExternalStatusUpdate(
      COMPANY_ID,
      created.orderId,
      null,
      buildExternalOrder({ internalStatus: 'SHIPPED', status: 'IN_TRANSIT', externalUpdatedAt: new Date('2026-08-03T00:00:00Z') }),
    );

    expect(result.applied).toBe(true);
    expect(db.orders.find((o) => o.id === created.orderId)!.status).toBe('SHIPPED');
    expect(db.inventories[0].onHand).toBe(8); // baixou de fato
    expect(db.inventories[0].reserved).toBe(0); // e liberou a reserva no mesmo movimento
  });
});
