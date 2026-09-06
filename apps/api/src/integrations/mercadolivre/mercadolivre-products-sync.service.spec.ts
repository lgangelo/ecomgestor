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
  size: string | null;
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
    size: overrides.size ?? null,
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
  const variantFindFirst = jest.fn();
  // Falhas de publicação de cor (SyncJob) — sem uso direto na maioria dos testes deste arquivo,
  // só precisa nunca lançar (senão um sucesso real vira "failed" só por causa do registro).
  const syncJobFindFirst = jest.fn().mockResolvedValue(null);
  const syncJobCreate = jest.fn();
  const syncJobUpdate = jest.fn();
  const syncJobDeleteMany = jest.fn();
  const prisma = {
    client: {
      product: { findMany: productFindMany },
      channelProductMapping: { findMany: mappingFindMany, upsert: mappingUpsert, update: mappingUpdate, findUnique: mappingFindUnique },
      productVariant: { findMany: variantFindMany, findFirst: variantFindFirst },
      syncJob: { findFirst: syncJobFindFirst, create: syncJobCreate, update: syncJobUpdate, deleteMany: syncJobDeleteMany },
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

  return {
    service,
    client,
    mappingUpsert,
    mappingUpdate,
    productFindMany,
    mappingFindMany,
    logger,
    syncJobCreate,
    syncJobUpdate,
    syncJobDeleteMany,
    variantFindFirst,
  };
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

  it(
    'ACHADO REAL (produto SKU LG032-2, erro item.description.type.invalid): remove tags HTML da ' +
      'descrição antes de mandar pro Mercado Livre, que exige texto plano — descrição salva no cadastro ' +
      'como "<p>Bolsa quadrada feminina</p>" vira texto puro',
    async () => {
      const variant = makeVariant();
      const product = makeProductRow([variant], { description: '<p>Bolsa quadrada feminina</p>' });
      const { service, client } = makeService({ products: [product] });

      await service.publishEligible(COMPANY_ID);

      expect(client.setItemDescription).toHaveBeenCalledWith('MLB-NEW-1', 'Bolsa quadrada feminina');
    },
  );

  it(
    'ACHADO REAL corrigido: quando setItemDescription falha, o vínculo já foi salvo (item já existe no ' +
      'Mercado Livre) — antes, essa falha abortava antes de gravar o vínculo, e o próximo ciclo criava ' +
      'um anúncio DUPLICADO do mesmo produto pra sempre (confirmado em produção: 157 anúncios duplicados)',
    async () => {
      const variant = makeVariant();
      const client = makeClient();
      client.setItemDescription = jest.fn().mockRejectedValue(new Error('descrição rejeitada'));
      const { service, mappingUpsert, logger } = makeService({ products: [makeProductRow([variant])], client });

      const result = await service.publishEligible(COMPANY_ID);

      expect(result).toEqual({ published: 1, failed: 0, skipped: 0 });
      expect(mappingUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ channelId: CHANNEL_ID, variantId: variant.id, externalProductId: 'MLB-NEW-1' }),
        }),
      );
      expect(logger.warn).toHaveBeenCalledWith('mercadolivre_set_description_failed', expect.anything());
    },
  );

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

  it(
    'ACHADO REAL (pedido do usuário): quando setItemDescription falha, registra a falha como SyncJob ' +
      'pra aparecer na tela de Jobs/Falhas (antes só virava um log, invisível pro usuário)',
    async () => {
      const variant = makeVariant();
      const client = makeClient();
      client.setItemDescription = jest.fn().mockRejectedValue(new Error('descrição rejeitada'));
      const { service, syncJobCreate } = makeService({ products: [makeProductRow([variant])], client });

      await service.publishEligible(COMPANY_ID);

      expect(syncJobCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'mercadolivre-publish-product-description',
            relatedExternalId: 'variant-1',
            status: 'FAILED',
            payload: { variantId: 'variant-1', sku: 'SKU-1' },
          }),
        }),
      );
    },
  );

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

  it('ACHADO REAL corrigido: marca o próprio item BASE com o atributo COLOR (antes nascia sem isso)', async () => {
    const azul = makeVariant({ id: 'v-azul', sku: 'SKU-AZUL', color: 'Azul' });
    const client = makeClient();
    client.createItem.mockResolvedValueOnce({ id: 'MLB-BASE', status: 'active' });
    const { service, syncJobDeleteMany } = makeService({ products: [makeProductRow([azul])], client });

    await service.publishEligible(COMPANY_ID);

    expect(client.updateItem).toHaveBeenCalledWith('MLB-BASE', { attributes: [{ id: 'COLOR', value_id: 'color-azul' }] });
    // Sucesso limpa qualquer falha anterior registrada pra esta variante (nunca deixa uma
    // falha resolvida presa na tela de Jobs/Falhas).
    expect(syncJobDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ relatedExternalId: 'v-azul' }) }),
    );
  });

  it(
    'ACHADO REAL (pedido do usuário): casa a cor mesmo com diferença de acento ou hífen/espaço contra o ' +
      'catálogo (ex.: "Marrom claro" cadastrado com espaço casa com "Marrom-claro" do Mercado Livre, que usa ' +
      'hífen) — antes exigia bater exatamente, letra por letra',
    async () => {
      const marromClaro = makeVariant({ id: 'v-marrom-claro', sku: 'SKU-MARROM-CLARO', color: 'Marrom claro' });
      const client = makeClient();
      client.getCategoryAttributes = jest.fn().mockResolvedValue([
        { id: 'BRAND', values: [{ id: 'brand-generic', name: 'Generic' }] },
        { id: 'COLOR', values: [{ id: 'color-marrom-claro', name: 'Marrom-claro' }] },
      ]);
      client.createItem.mockResolvedValueOnce({ id: 'MLB-BASE', status: 'active' });
      const { service } = makeService({ products: [makeProductRow([marromClaro])], client });

      await service.publishEligible(COMPANY_ID);

      expect(client.updateItem).toHaveBeenCalledWith('MLB-BASE', { attributes: [{ id: 'COLOR', value_id: 'color-marrom-claro' }] });
    },
  );

  it(
    'ACHADO REAL (pedido do usuário): quando o item base nasce sem a cor marcada (cor sem correspondência ' +
      'no catálogo, ex.: "Mostarda"), registra a falha como SyncJob pra aparecer na tela de Jobs/Falhas',
    async () => {
      const mostarda = makeVariant({ id: 'v-mostarda', sku: 'SKU-MOSTARDA', color: 'Mostarda' });
      const client = makeClient();
      client.createItem.mockResolvedValueOnce({ id: 'MLB-BASE', status: 'active' });
      const { service, syncJobCreate } = makeService({ products: [makeProductRow([mostarda])], client });

      await service.publishEligible(COMPANY_ID);

      expect(client.updateItem).not.toHaveBeenCalled();
      expect(syncJobCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'mercadolivre-publish-product-color',
            relatedExternalId: 'v-mostarda',
            status: 'FAILED',
            payload: { variantId: 'v-mostarda', sku: 'SKU-MOSTARDA', color: 'Mostarda' },
          }),
        }),
      );
    },
  );

  it('ACHADO REAL corrigido: uma cor sem correspondência no catálogo (ex.: nome em inglês) nunca derruba as demais cores do mesmo produto', async () => {
    const azul = makeVariant({ id: 'v-azul', sku: 'SKU-AZUL', color: 'Azul' });
    // "Pink" não existe na lista de valores de COLOR do makeClient() (só Azul/Vermelho) —
    // simula exatamente o caso real (cor cadastrada em inglês, catálogo do ML é em português).
    const pink = makeVariant({ id: 'v-pink', sku: 'SKU-PINK', color: 'Pink' });
    const vermelho = makeVariant({ id: 'v-vermelho', sku: 'SKU-VERMELHO', color: 'Vermelho' });
    const client = makeClient();
    client.createItem
      .mockResolvedValueOnce({ id: 'MLB-BASE', status: 'active' })
      .mockResolvedValueOnce({ id: 'MLB-VERMELHO', status: 'active' });
    const { service, mappingUpsert } = makeService({ products: [makeProductRow([azul, pink, vermelho])], client });

    const result = await service.publishEligible(COMPANY_ID);

    // Base (Azul) + Vermelho publicados com sucesso; só Pink falha — nunca aborta o produto inteiro.
    expect(result).toEqual({ published: 2, failed: 1, skipped: 0 });
    expect(client.createItem).toHaveBeenCalledTimes(2);
    expect(mappingUpsert).toHaveBeenCalledTimes(2);
  });

  it('DECISÃO DO USUÁRIO: tamanho vira uma família SEPARADA por tamanho (Mercado Livre não tem atributo de tamanho pra bolsas) — cor varia dentro de cada tamanho', async () => {
    const azulP = makeVariant({ id: 'v-azul-p', sku: 'SKU-AZUL-P', color: 'Azul', size: 'P' });
    const vermelhoP = makeVariant({ id: 'v-vermelho-p', sku: 'SKU-VERMELHO-P', color: 'Vermelho', size: 'P' });
    const azulM = makeVariant({ id: 'v-azul-m', sku: 'SKU-AZUL-M', color: 'Azul', size: 'M' });
    const vermelhoM = makeVariant({ id: 'v-vermelho-m', sku: 'SKU-VERMELHO-M', color: 'Vermelho', size: 'M' });
    const client = makeClient();
    client.createItem
      .mockResolvedValueOnce({ id: 'MLB-P-BASE', status: 'active' })
      .mockResolvedValueOnce({ id: 'MLB-P-VERMELHO', status: 'active' })
      .mockResolvedValueOnce({ id: 'MLB-M-BASE', status: 'active' })
      .mockResolvedValueOnce({ id: 'MLB-M-VERMELHO', status: 'active' });
    const { service, mappingUpsert } = makeService({
      products: [makeProductRow([azulP, vermelhoP, azulM, vermelhoM])],
      client,
    });

    const result = await service.publishEligible(COMPANY_ID);

    expect(result).toEqual({ published: 4, failed: 0, skipped: 0 });
    expect(client.createItem).toHaveBeenCalledTimes(4);
    // Família do tamanho P inclui "P" no título; família do tamanho M inclui "M" — nunca a
    // mesma família pros dois tamanhos.
    expect(client.createItem.mock.calls[0][0]).toMatchObject({ family_name: 'Bolsa Teste - P' });
    expect(client.createItem.mock.calls[1][0]).toMatchObject({ family_name: 'Bolsa Teste - P' });
    expect(client.createItem.mock.calls[2][0]).toMatchObject({ family_name: 'Bolsa Teste - M' });
    expect(client.createItem.mock.calls[3][0]).toMatchObject({ family_name: 'Bolsa Teste - M' });
    expect(mappingUpsert).toHaveBeenCalledTimes(4);
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
