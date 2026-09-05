import { ChannelMappingSyncStatus } from '@ecommerce-manager/database';
import { MercadoLivreProductsSyncService } from './mercadolivre-products-sync.service';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { MercadoLivreCredentialsService } from './mercadolivre-credentials.service';
import type { MercadoLivreConnectorFactory } from './mercadolivre-connector.factory';
import type { AuditService } from '../../audit/audit.service';
import type { AppLoggerService } from '../../common/logger/app-logger.service';

const CHANNEL_ID = 'channel-1';
const COMPANY_ID = 'company-1';

const CONFIG_VALUES: Record<string, unknown> = {
  'mercadoLivre.priceMarkupPercent': 0,
};

interface TestVariant {
  id: string;
  sku: string;
  color: string | null;
  status: string;
  suggestedPrice: number;
  imageUrl: string | null;
  inventory: { onHand: number; reserved: number } | null;
  createdAt: Date;
}

function makeVariant(overrides: Partial<TestVariant> = {}): TestVariant {
  return {
    id: overrides.id ?? 'variant-1',
    sku: overrides.sku ?? 'SKU-1',
    color: overrides.color ?? null,
    status: overrides.status ?? 'ACTIVE',
    suggestedPrice: overrides.suggestedPrice ?? 100,
    imageUrl: overrides.imageUrl ?? null,
    inventory: overrides.inventory === undefined ? { onHand: 10, reserved: 0 } : overrides.inventory,
    createdAt: new Date(),
  };
}

function makeProductRow(variants: ReturnType<typeof makeVariant>[], overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? 'product-1',
    name: overrides.name ?? 'Bolsa Teste',
    description: overrides.description ?? 'Descrição',
    status: overrides.status ?? 'ACTIVE',
    baseSku: overrides.baseSku ?? 'BASE-1',
    imageUrl: overrides.imageUrl ?? 'https://cdn.example.com/capa.jpg',
    images: overrides.images ?? [],
    variants,
  };
}

function makeClient() {
  return {
    predictCategory: jest.fn().mockResolvedValue([{ category_id: 'MLB123', category_name: 'Bolsas' }]),
    getListingTypes: jest.fn().mockResolvedValue([{ id: 'gold_special', name: 'Clássico' }]),
    getCategoryAttributes: jest.fn().mockResolvedValue([
      { id: 'BRAND', values: [{ id: 'brand-generic', name: 'Generic' }] },
      { id: 'COLOR', values: [{ id: 'color-azul', name: 'Azul' }, { id: 'color-vermelho', name: 'Vermelho' }] },
    ]),
    createItem: jest.fn().mockResolvedValue({ id: 'MLB-NEW-1', status: 'active' }),
    setItemDescription: jest.fn().mockResolvedValue(undefined),
    getItem: jest.fn(),
    updateItem: jest.fn().mockResolvedValue({}),
  };
}

function makeService(opts: {
  products: ReturnType<typeof makeProductRow>[];
  existingMappings?: Array<{ variantId: string; externalProductId: string | null; syncStatus: ChannelMappingSyncStatus }>;
  client?: ReturnType<typeof makeClient>;
}) {
  const client = opts.client ?? makeClient();
  const configService = { get: jest.fn((key: string) => CONFIG_VALUES[key]) };

  const productFindMany = jest.fn().mockResolvedValue(opts.products);
  const mappingFindMany = jest.fn().mockResolvedValue(opts.existingMappings ?? []);
  const mappingUpsert = jest.fn();
  const mappingUpdate = jest.fn();
  const mappingFindUnique = jest.fn();
  const variantFindMany = jest.fn().mockResolvedValue([]);
  const prisma = {
    client: {
      product: { findMany: productFindMany },
      channelProductMapping: { findMany: mappingFindMany, upsert: mappingUpsert, update: mappingUpdate, findUnique: mappingFindUnique },
      productVariant: { findMany: variantFindMany },
    },
  };

  const credentialsService = { requireIntegration: jest.fn().mockResolvedValue({ id: 'integration-1', channelId: CHANNEL_ID }) };
  const connectorFactory = { forCompany: jest.fn().mockResolvedValue({ client }) };
  const audit = { log: jest.fn() };
  const logger = { setContext: jest.fn(), log: jest.fn(), warn: jest.fn(), error: jest.fn() };

  const service = new MercadoLivreProductsSyncService(
    configService as unknown as ConfigService,
    prisma as unknown as PrismaService,
    credentialsService as unknown as MercadoLivreCredentialsService,
    connectorFactory as unknown as MercadoLivreConnectorFactory,
    audit as unknown as AuditService,
    logger as unknown as AppLoggerService,
  );

  return { service, client, mappingUpsert, mappingUpdate, productFindMany, mappingFindMany, logger };
}

describe('MercadoLivreProductsSyncService.publishEligible', () => {
  it('publica um produto sem cor (item único) e grava o vínculo', async () => {
    const variant = makeVariant();
    const { service, client, mappingUpsert } = makeService({ products: [makeProductRow([variant])] });

    const result = await service.publishEligible(COMPANY_ID);

    expect(result).toEqual({ published: 1, failed: 0, skipped: 0 });
    expect(client.createItem).toHaveBeenCalledTimes(1);
    expect(client.createItem.mock.calls[0][0]).toMatchObject({ family_name: 'Bolsa Teste', category_id: 'MLB123' });
    expect(client.setItemDescription).toHaveBeenCalledWith('MLB-NEW-1', 'Descrição');
    expect(mappingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ channelId: CHANNEL_ID, variantId: variant.id, externalProductId: 'MLB-NEW-1' }),
      }),
    );
  });

  it('pula produto sem cor já publicado (mapeamento CONFIRMED existente)', async () => {
    const variant = makeVariant();
    const { service, client } = makeService({
      products: [makeProductRow([variant])],
      existingMappings: [{ variantId: variant.id, externalProductId: 'MLB-OLD', syncStatus: ChannelMappingSyncStatus.CONFIRMED }],
    });

    const result = await service.publishEligible(COMPANY_ID);

    expect(result).toEqual({ published: 0, failed: 0, skipped: 1 });
    expect(client.createItem).not.toHaveBeenCalled();
  });

  it('pula produto sem cor sem estoque disponível', async () => {
    const variant = makeVariant({ inventory: { onHand: 0, reserved: 0 } });
    const { service, client } = makeService({ products: [makeProductRow([variant])] });

    const result = await service.publishEligible(COMPANY_ID);

    expect(result).toEqual({ published: 0, failed: 0, skipped: 1 });
    expect(client.createItem).not.toHaveBeenCalled();
  });

  it('publica a base + cores adicionais quando nenhuma cor ainda foi publicada', async () => {
    const azul = makeVariant({ id: 'v-azul', sku: 'SKU-AZUL', color: 'Azul', inventory: { onHand: 5, reserved: 0 } });
    const vermelho = makeVariant({ id: 'v-vermelho', sku: 'SKU-VERMELHO', color: 'Vermelho', inventory: { onHand: 0, reserved: 0 } });
    const client = makeClient();
    client.createItem
      .mockResolvedValueOnce({ id: 'MLB-BASE', status: 'active' })
      .mockResolvedValueOnce({ id: 'MLB-COR-2', status: 'active' });
    const { service, mappingUpsert } = makeService({ products: [makeProductRow([azul, vermelho])], client });

    const result = await service.publishEligible(COMPANY_ID);

    expect(result).toEqual({ published: 2, failed: 0, skipped: 0 });
    expect(client.createItem).toHaveBeenCalledTimes(2);
    // A base é a cor com estoque disponível (Azul); a adicional (Vermelho) usa o mesmo family_name.
    expect(client.createItem.mock.calls[0][0]).toMatchObject({ family_name: 'Bolsa Teste' });
    expect(client.createItem.mock.calls[1][0]).toMatchObject({ family_name: 'Bolsa Teste', available_quantity: 0 });
    expect(mappingUpsert).toHaveBeenCalledTimes(2);
  });

  it('quando uma cor já está publicada, busca o item base via getItem e só cria a cor nova', async () => {
    const azul = makeVariant({ id: 'v-azul', sku: 'SKU-AZUL', color: 'Azul' });
    const vermelho = makeVariant({ id: 'v-vermelho', sku: 'SKU-VERMELHO', color: 'Vermelho' });
    const client = makeClient();
    client.getItem.mockResolvedValue({ category_id: 'MLB123', family_name: 'Bolsa Teste', listing_type_id: 'gold_special' });
    client.createItem.mockResolvedValueOnce({ id: 'MLB-COR-2', status: 'active' });
    const { service } = makeService({
      products: [makeProductRow([azul, vermelho])],
      existingMappings: [{ variantId: azul.id, externalProductId: 'MLB-BASE', syncStatus: ChannelMappingSyncStatus.CONFIRMED }],
      client,
    });

    const result = await service.publishEligible(COMPANY_ID);

    expect(result).toEqual({ published: 1, failed: 0, skipped: 0 });
    expect(client.getItem).toHaveBeenCalledWith('MLB-BASE');
    expect(client.predictCategory).not.toHaveBeenCalled(); // reusa a categoria do item base, nunca reprevê
    expect(client.createItem).toHaveBeenCalledTimes(1);
  });

  it('nunca aborta o lote inteiro quando um produto falha — continua e conta como failed', async () => {
    const okVariant = makeVariant({ id: 'v-ok', sku: 'SKU-OK' });
    const failingProduct = makeProductRow([makeVariant({ id: 'v-fail', sku: 'SKU-FAIL' })], { id: 'product-fail' });
    const client = makeClient();
    client.predictCategory
      .mockRejectedValueOnce(new Error('falha de rede'))
      .mockResolvedValue([{ category_id: 'MLB123', category_name: 'Bolsas' }]);
    const { service } = makeService({ products: [failingProduct, makeProductRow([okVariant])], client });

    const result = await service.publishEligible(COMPANY_ID);

    expect(result).toEqual({ published: 1, failed: 1, skipped: 0 });
  });
});

describe('MercadoLivreProductsSyncService.syncPublished', () => {
  it('chama updateItem/setItemDescription e grava o novo hash quando nunca foi sincronizado (hash null)', async () => {
    const variant = makeVariant();
    const product = makeProductRow([variant]);
    const client = makeClient();
    const { service, mappingUpdate } = makeService({
      products: [product],
      existingMappings: [
        { variantId: variant.id, externalProductId: 'MLB-1', syncStatus: ChannelMappingSyncStatus.CONFIRMED },
      ],
      client,
    });

    const result = await service.syncPublished(COMPANY_ID);

    expect(result).toEqual({ updated: 1, failed: 0, unchanged: 0 });
    expect(client.updateItem).toHaveBeenCalledWith('MLB-1', expect.objectContaining({ price: 100, status: 'active' }));
    expect(client.setItemDescription).toHaveBeenCalledWith('MLB-1', 'Descrição');
    expect(mappingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { channelId_variantId: { channelId: CHANNEL_ID, variantId: variant.id } },
        data: expect.objectContaining({ lastPushedSnapshotHash: expect.any(String) }),
      }),
    );
  });

  it('não chama a API quando o snapshot não mudou desde o último push (hash já salvo bate)', async () => {
    const variant = makeVariant();
    const product = makeProductRow([variant]);

    // Primeiro ciclo: hash começa null, força 1 update; capturamos o hash gravado.
    const first = makeService({
      products: [product],
      existingMappings: [{ variantId: variant.id, externalProductId: 'MLB-1', syncStatus: ChannelMappingSyncStatus.CONFIRMED }],
    });
    await first.service.syncPublished(COMPANY_ID);
    const savedHash = first.mappingUpdate.mock.calls[0][0].data.lastPushedSnapshotHash as string;

    // Segundo ciclo: mesmo estado do produto, mas o mapping já chega com esse hash salvo.
    const client = makeClient();
    const { service } = makeService({
      products: [product],
      existingMappings: [
        { variantId: variant.id, externalProductId: 'MLB-1', syncStatus: ChannelMappingSyncStatus.CONFIRMED, lastPushedSnapshotHash: savedHash } as never,
      ],
      client,
    });

    const result = await service.syncPublished(COMPANY_ID);

    expect(result).toEqual({ updated: 0, failed: 0, unchanged: 1 });
    expect(client.updateItem).not.toHaveBeenCalled();
  });

  it('pausa o item quando a variante/produto fica INACTIVE', async () => {
    const variant = makeVariant({ status: 'INACTIVE' });
    const product = makeProductRow([variant], { status: 'INACTIVE' });
    const client = makeClient();
    const { service, productFindMany } = makeService({
      products: [], // produto INACTIVE nunca vem de fetchProducts (filtra status ACTIVE na query real)
      existingMappings: [
        { variantId: variant.id, externalProductId: 'MLB-1', syncStatus: ChannelMappingSyncStatus.CONFIRMED },
      ],
      client,
    });
    void productFindMany;
    const prismaAny = (service as unknown as { prisma: { client: { productVariant: { findMany: jest.Mock } } } }).prisma;
    prismaAny.client.productVariant.findMany.mockResolvedValue([
      {
        id: variant.id,
        sku: variant.sku,
        color: variant.color,
        status: 'INACTIVE',
        suggestedPrice: variant.suggestedPrice,
        imageUrl: variant.imageUrl,
        inventory: { onHand: 10, reserved: 0 },
        product,
      },
    ]);

    const result = await service.syncPublished(COMPANY_ID);

    expect(result.updated).toBe(1);
    expect(client.updateItem).toHaveBeenCalledWith('MLB-1', expect.objectContaining({ status: 'paused' }));
  });
});
