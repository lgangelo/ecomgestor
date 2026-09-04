import { TikTokProductsSyncService } from './tiktok-products-sync.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { TikTokCredentialsService } from './tiktok-credentials.service';
import type { TikTokConnectorFactory } from './tiktok-connector.factory';
import type { AuditService } from '../../audit/audit.service';
import type { InventoryLedgerService } from '../../inventory/ledger.service';
import type { ProductsService } from '../../products/products.service';
import type { AppLoggerService } from '../../common/logger/app-logger.service';

const COMPANY_ID = 'company-1';
const CHANNEL_ID = 'channel-1';
const VARIANT_ID = 'variant-1';
const EXTERNAL_SKU = 'ext-sku-1';

function makeService(opts: {
  externalStock: number;
  onHand: number;
  reserved: number;
  orderItems: Array<{ quantity: number; status: string; stockAppliedStatus: string }>;
}) {
  const adjust = jest.fn();

  const prisma = {
    client: {
      channelProductMapping: {
        findMany: jest.fn().mockResolvedValue([{ externalSku: EXTERNAL_SKU, variantId: VARIANT_ID }]),
      },
      productVariant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: VARIANT_ID,
          suggestedPrice: '10.00',
          color: 'Azul',
          size: 'M',
          inventory: { onHand: opts.onHand, reserved: opts.reserved },
          product: { id: 'product-1', imageUrl: 'https://x/img.png', description: 'desc' },
        }),
        update: jest.fn(),
      },
      product: { update: jest.fn() },
      orderItem: {
        findMany: jest.fn().mockResolvedValue(
          opts.orderItems.map((i) => ({
            quantity: i.quantity,
            order: { status: i.status, stockAppliedStatus: i.stockAppliedStatus },
          })),
        ),
      },
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn({})),
    },
  };

  const credentialsService = { requireIntegration: jest.fn().mockResolvedValue({ channelId: CHANNEL_ID }) };
  const getProducts = jest.fn().mockResolvedValue({
    items: [{ externalSku: EXTERNAL_SKU, price: '10.00', stock: opts.externalStock }],
    nextPageToken: undefined,
  });
  const connectorFactory = { forCompany: jest.fn().mockResolvedValue({ connector: { getProducts } }) };
  const audit = { log: jest.fn() };
  const ledger = { adjust };
  const productsService = { mirrorExternalImage: jest.fn() };
  const logger = { setContext: jest.fn(), log: jest.fn(), warn: jest.fn(), error: jest.fn() };

  const service = new TikTokProductsSyncService(
    prisma as unknown as PrismaService,
    credentialsService as unknown as TikTokCredentialsService,
    connectorFactory as unknown as TikTokConnectorFactory,
    audit as unknown as AuditService,
    ledger as unknown as InventoryLedgerService,
    productsService as unknown as ProductsService,
    logger as unknown as AppLoggerService,
  );

  return { service, adjust };
}

describe('TikTokProductsSyncService.syncLinkedProducts — nunca rouba de volta uma unidade que um pedido local ainda vai debitar', () => {
  it('não ajusta o estoque quando o disponível da TikTok já reflete uma venda cuja baixa local ainda está pendente', async () => {
    // TikTok diz "0 disponível" porque já vendeu a única unidade; localmente onHand=1 porque essa
    // MESMA venda ainda não foi debitada aqui (status SHIPPED, stockAppliedStatus ainda PROCESSING).
    // Sem somar de volta a quantidade pendente, isto zeraria onHand e travaria o pedido para sempre.
    const { service, adjust } = makeService({
      externalStock: 0,
      onHand: 1,
      reserved: 0,
      orderItems: [{ quantity: 1, status: 'SHIPPED', stockAppliedStatus: 'PROCESSING' }],
    });

    await service.syncLinkedProducts(COMPANY_ID, null);

    expect(adjust).not.toHaveBeenCalled();
  });

  it('ainda corrige divergência real de estoque quando não há baixa local pendente', async () => {
    const { service, adjust } = makeService({
      externalStock: 5,
      onHand: 2,
      reserved: 0,
      orderItems: [],
    });

    await service.syncLinkedProducts(COMPANY_ID, null);

    expect(adjust).toHaveBeenCalledTimes(1);
    expect(adjust.mock.calls[0][2]).toBe(3); // delta: 5 (TikTok) - 2 (local) = 3
  });
});
