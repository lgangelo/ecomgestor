import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { TikTokCredentialsService } from './tiktok-credentials.service';
import type { TikTokConnectorFactory } from './tiktok-connector.factory';
import type { AuditService } from '../../audit/audit.service';
import type { AppLoggerService } from '../../common/logger/app-logger.service';
import { TikTokProductsPublishService } from './tiktok-products-publish.service';

const COMPANY_ID = 'company-1';
const CHANNEL_ID = 'channel-1';

function makeVariant(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? 'variant-1',
    sku: overrides.sku ?? 'SKU-1',
    color: overrides.color ?? null,
    size: overrides.size ?? null,
    status: overrides.status ?? 'ACTIVE',
    suggestedPrice: overrides.suggestedPrice ?? 100,
    imageUrl: overrides.imageUrl ?? null,
    inventory: overrides.inventory === undefined ? { onHand: 5, reserved: 0 } : overrides.inventory,
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
    categoryId: overrides.categoryId === undefined ? 'category-1' : overrides.categoryId,
    imageUrl: overrides.imageUrl ?? null,
    images: overrides.images ?? [],
    variants,
  };
}

function makeConnector() {
  return {
    getWarehouses: jest.fn(),
    getCategoryAttributes: jest.fn().mockResolvedValue([]),
    uploadImage: jest.fn().mockResolvedValue({ uri: 'tos-fake-uri', url: 'https://p.example/x', width: 800, height: 800, useCase: 'MAIN_IMAGE' }),
    createProduct: jest.fn().mockResolvedValue({ product_id: 'tt-product-1' }),
  };
}

function makeService(opts: {
  products: ReturnType<typeof makeProductRow>[];
  connector?: ReturnType<typeof makeConnector>;
  categoryMapping?: { externalCategoryId: string; externalCategoryVersion: string | null; cachedAttributes?: unknown } | null;
  defaultWarehouseId?: string | null;
}) {
  const connector = opts.connector ?? makeConnector();
  const configValues: Record<string, unknown> = { 'tiktok.defaultWarehouseId': opts.defaultWarehouseId ?? 'warehouse-fixed-1' };
  const configService = { get: jest.fn((key: string) => configValues[key]) };

  const productFindMany = jest.fn().mockResolvedValue(opts.products);
  const mappingFindMany = jest.fn().mockResolvedValue([]);
  const mappingUpsert = jest.fn();
  const categoryMappingFindUnique = jest.fn().mockResolvedValue(
    opts.categoryMapping === undefined ? { externalCategoryId: 'tt-cat-1', externalCategoryVersion: null } : opts.categoryMapping,
  );
  const syncJobFindFirst = jest.fn().mockResolvedValue(null);
  const syncJobCreate = jest.fn();
  const syncJobUpdate = jest.fn();
  const syncJobDeleteMany = jest.fn();

  const prisma = {
    client: {
      product: { findMany: productFindMany },
      channelProductMapping: { findMany: mappingFindMany, upsert: mappingUpsert },
      categoryChannelMapping: { findUnique: categoryMappingFindUnique },
      syncJob: { findFirst: syncJobFindFirst, create: syncJobCreate, update: syncJobUpdate, deleteMany: syncJobDeleteMany },
    },
  };

  const credentialsService = { requireIntegration: jest.fn().mockResolvedValue({ id: 'integration-1', channelId: CHANNEL_ID }) };
  const connectorFactory = { forCompany: jest.fn().mockResolvedValue({ connector }) };
  const audit = { log: jest.fn() };
  const logger = { setContext: jest.fn(), log: jest.fn(), warn: jest.fn(), error: jest.fn() };

  const service = new TikTokProductsPublishService(
    configService as unknown as ConfigService,
    prisma as unknown as PrismaService,
    credentialsService as unknown as TikTokCredentialsService,
    connectorFactory as unknown as TikTokConnectorFactory,
    audit as unknown as AuditService,
    logger as unknown as AppLoggerService,
  );

  return { service, connector, mappingUpsert, syncJobCreate };
}

describe('TikTokProductsPublishService.buildProductPayload', () => {
  it('monta o payload com título, categoria, imagens e skus corretos quando tudo resolve', async () => {
    const variant = makeVariant();
    const { service } = makeService({ products: [makeProductRow([variant])] });

    const payload = await service.buildProductPayload(COMPANY_ID, 'product-1');

    expect(payload).toMatchObject({
      title: 'Bolsa Teste',
      description: 'Descrição',
      category_id: 'tt-cat-1',
      skus: [
        {
          inventory: [{ warehouse_id: 'warehouse-fixed-1', quantity: 5 }],
          price: { amount: '100', currency: 'BRL' },
          seller_sku: 'SKU-1',
        },
      ],
    });
  });

  it('usa o warehouse_id fixo (TIKTOK_DEFAULT_WAREHOUSE_ID) sem chamar getWarehouses', async () => {
    const variant = makeVariant();
    const { service, connector } = makeService({ products: [makeProductRow([variant])], defaultWarehouseId: '7595878608955557653' });

    const payload = await service.buildProductPayload(COMPANY_ID, 'product-1');

    expect(connector.getWarehouses).not.toHaveBeenCalled();
    expect(payload.skus[0].inventory[0].warehouse_id).toBe('7595878608955557653');
  });

  it('lança erro claro quando o produto não tem categoria cadastrada', async () => {
    const variant = makeVariant();
    const { service } = makeService({ products: [makeProductRow([variant], { categoryId: null })] });

    await expect(service.buildProductPayload(COMPANY_ID, 'product-1')).rejects.toThrow(/sem categoria cadastrada/i);
  });

  it('lança erro claro quando a categoria não tem mapeamento pra TikTok Shop configurado', async () => {
    const variant = makeVariant();
    const { service } = makeService({ products: [makeProductRow([variant])], categoryMapping: null });

    await expect(service.buildProductPayload(COMPANY_ID, 'product-1')).rejects.toThrow(/sem mapeamento pra TikTok Shop/i);
  });

  it(
    'usa o cache confirmado (cachedAttributes) sem chamar getCategoryAttributes ao vivo — evita ' +
      'uma chamada por publicação pra uma categoria já confirmada',
    async () => {
      const variant = makeVariant({ color: 'Azul' });
      const connector = makeConnector();
      const { service } = makeService({
        products: [makeProductRow([variant])],
        connector,
        categoryMapping: {
          externalCategoryId: 'tt-cat-1',
          externalCategoryVersion: null,
          cachedAttributes: [
            { id: '100', name: 'Cor', type: 'SALES_PROPERTY', isRequired: false, isCustomizable: false, values: [{ id: 'v-azul', name: 'Azul' }] },
          ],
        },
      });

      const payload = await service.buildProductPayload(COMPANY_ID, 'product-1');

      expect(connector.getCategoryAttributes).not.toHaveBeenCalled();
      expect(payload.skus[0].sales_attributes).toEqual([{ id: '100', value_id: 'v-azul' }]);
    },
  );

  it('DECISÃO DO USUÁRIO: usa value_name livre (sem precisar bater com o catálogo) quando o atributo é customizável', async () => {
    const variant = makeVariant({ color: 'Azul-petróleo bem específico' });
    const connector = makeConnector();
    connector.getCategoryAttributes.mockResolvedValue([
      { id: '100', name: 'Cor', type: 'SALES_PROPERTY', isRequired: false, isCustomizable: true, values: [] },
    ]);
    const { service } = makeService({ products: [makeProductRow([variant])], connector });

    const payload = await service.buildProductPayload(COMPANY_ID, 'product-1');

    expect(payload.skus[0].sales_attributes).toEqual([{ id: '100', name: 'Cor', value_name: 'Azul-petróleo bem específico' }]);
  });

  it('lança erro claro quando a cor não bate com o catálogo fechado (atributo não customizável)', async () => {
    const variant = makeVariant({ color: 'Cor Inventada' });
    const connector = makeConnector();
    connector.getCategoryAttributes.mockResolvedValue([
      { id: '100', name: 'Color', type: 'SALES_PROPERTY', isRequired: false, isCustomizable: false, values: [{ id: '1', name: 'Preto' }] },
    ]);
    const { service } = makeService({ products: [makeProductRow([variant])], connector });

    await expect(service.buildProductPayload(COMPANY_ID, 'product-1')).rejects.toThrow(/Cor "Cor Inventada" não encontrada/);
  });

  it('faz upload da foto de capa como MAIN_IMAGE e usa o uri devolvido (nunca a url completa)', async () => {
    const variant = makeVariant();
    const connector = makeConnector();
    const { service } = makeService({
      products: [makeProductRow([variant], { imageUrl: 'https://cdn.example.com/capa.jpg' })],
      connector,
    });

    global.fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }) as unknown as typeof fetch;

    const payload = await service.buildProductPayload(COMPANY_ID, 'product-1');

    expect(connector.uploadImage).toHaveBeenCalledWith(expect.any(Buffer), 'capa.jpg', 'MAIN_IMAGE');
    expect(payload.main_images).toEqual([{ uri: 'tos-fake-uri' }]);
  });

  it(
    'ACHADO REAL (payload de teste real): nunca repete a mesma foto em main_images quando URLs ' +
      'locais diferentes (capa + galeria) voltam do upload com o mesmo uri da TikTok (dedup do ' +
      'lado deles pelo conteúdo do arquivo)',
    async () => {
      const variant = makeVariant();
      const connector = makeConnector();
      // Mock padrão já devolve o MESMO uri fixo pra toda chamada — simula duas fotos com URL de
      // origem diferente, mesmo conteúdo, que a TikTok devolve com o uri idêntico.
      const { service } = makeService({
        products: [
          makeProductRow([variant], {
            imageUrl: 'https://cdn.example.com/capa.jpg',
            images: [{ url: 'https://cdn.example.com/capa-duplicada.jpg', position: 1 }],
          }),
        ],
        connector,
      });

      global.fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }) as unknown as typeof fetch;

      const payload = await service.buildProductPayload(COMPANY_ID, 'product-1');

      expect(connector.uploadImage).toHaveBeenCalledTimes(2);
      expect(payload.main_images).toEqual([{ uri: 'tos-fake-uri' }]);
    },
  );
});
