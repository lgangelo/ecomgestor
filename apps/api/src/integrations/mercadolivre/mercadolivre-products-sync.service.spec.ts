import { ChannelMappingSyncStatus } from '@ecommerce-manager/database';
import { MercadoLivreApiError } from '@ecommerce-manager/integrations';
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
  barcode: string | null;
  costHistory: Array<{ cost: number }>;
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
    barcode: overrides.barcode ?? null,
    // Dados fiscais (Enviar Dados Fiscais) — sem custo cadastrado por padrão, igual a maioria dos
    // testes existentes que nunca tratam disso; `costHistory` sempre precisa existir como array
    // (o código de verdade sempre inclui isso via Prisma).
    costHistory: overrides.costHistory ?? [],
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
    categoryId: overrides.categoryId === undefined ? null : overrides.categoryId,
    imageUrl: overrides.imageUrl ?? 'https://cdn.example.com/capa.jpg',
    externalMaterial: overrides.externalMaterial ?? null,
    images: overrides.images ?? [],
    variants,
  };
}

function makeClient() {
  return {
    predictCategory: jest.fn().mockResolvedValue([{ category_id: 'MLB123', category_name: 'Bolsas' }]),
    getListingTypes: jest.fn().mockResolvedValue([{ id: 'gold_special', name: 'Clássico' }, { id: 'gold_pro', name: 'Premium' }]),
    getCategoryAttributes: jest.fn().mockResolvedValue([
      { id: 'BRAND', values: [{ id: 'brand-generic', name: 'Generic' }] },
      { id: 'COLOR', values: [{ id: 'color-azul', name: 'Azul' }, { id: 'color-vermelho', name: 'Vermelho' }] },
    ]),
    createItem: jest.fn().mockResolvedValue({ id: 'MLB-NEW-1', status: 'active' }),
    setItemDescription: jest.fn().mockResolvedValue(undefined),
    getItem: jest.fn(),
    updateItem: jest.fn().mockResolvedValue({}),
    setFiscalInformation: jest.fn().mockResolvedValue({}),
    updateFiscalInformation: jest.fn().mockResolvedValue({}),
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
  // Nulo por padrão — a maioria dos testes não configura perfil fiscal nenhum, então
  // `tryFiscalInformation` nunca chama a API de verdade (payload sai `undefined`).
  const fiscalProfileFindUnique = jest.fn().mockResolvedValue(null);
  const integrationUpdate = jest.fn().mockResolvedValue({});
  const prisma = {
    client: {
      product: { findMany: productFindMany },
      channelProductMapping: { findMany: mappingFindMany, upsert: mappingUpsert, update: mappingUpdate, findUnique: mappingFindUnique },
      productVariant: { findMany: variantFindMany, findFirst: variantFindFirst },
      categoryFiscalProfile: { findUnique: fiscalProfileFindUnique },
      syncJob: { findFirst: syncJobFindFirst, create: syncJobCreate, update: syncJobUpdate, deleteMany: syncJobDeleteMany },
      integration: { update: integrationUpdate },
    },
  };

  const credentialsService = {
    requireIntegration: jest.fn().mockResolvedValue({ id: 'integration-1', channelId: CHANNEL_ID, syncCheckpoints: null }),
  };
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
    mappingFindUnique,
    productFindMany,
    mappingFindMany,
    logger,
    syncJobFindFirst,
    syncJobCreate,
    syncJobUpdate,
    syncJobDeleteMany,
    variantFindFirst,
    fiscalProfileFindUnique,
    integrationUpdate,
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
    // DECISÃO DO USUÁRIO (confirmado via GET /sites/MLB/listing_types real): "Premium" é o id
    // `gold_pro`, nunca `gold_premium` (que é "Diamante") — habilita parcelamento sem juros.
    expect(client.createItem.mock.calls[0][0]).toMatchObject({ listing_type_id: 'gold_pro' });
    expect(mappingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ channelId: CHANNEL_ID, variantId: variant.id, externalProductId: 'MLB-NEW-1' }),
      }),
    );
  });

  it(
    'ACHADO REAL (o Mercado Livre usa a 1ª foto de cada item como miniatura da variação): a foto ' +
      'da PRÓPRIA variação vem primeiro, capa e galeria do produto entram depois (nunca somem)',
    async () => {
      const variant = makeVariant({ imageUrl: 'https://cdn.example.com/variacao-azul.jpg' });
      const { service, client } = makeService({
        products: [
          makeProductRow([variant], {
            imageUrl: 'https://cdn.example.com/capa.jpg',
            images: [
              { url: 'https://cdn.example.com/galeria-2.jpg', position: 2 },
              { url: 'https://cdn.example.com/galeria-1.jpg', position: 1 },
            ],
          }),
        ],
      });

      await service.publishEligible(COMPANY_ID);

      expect(client.createItem.mock.calls[0][0]).toMatchObject({
        pictures: [
          { source: 'https://cdn.example.com/variacao-azul.jpg' },
          { source: 'https://cdn.example.com/capa.jpg' },
          { source: 'https://cdn.example.com/galeria-1.jpg' },
          { source: 'https://cdn.example.com/galeria-2.jpg' },
        ],
      });
    },
  );

  it(
    'ACHADO REAL (pedido do usuário): sem capa própria do produto, a foto da variação assume só ' +
      'como fallback da capa (nunca sem nenhuma foto)',
    async () => {
      const variant = makeVariant({ imageUrl: 'https://cdn.example.com/variacao-azul.jpg' });
      // `makeProductRow` usa `??` nos defaults — passar `imageUrl: null` não teria efeito (null
      // também é nullish), por isso monta o produto direto aqui, sem o helper.
      const productWithoutCover = {
        id: 'product-1',
        name: 'Bolsa Teste',
        description: 'Descrição',
        status: 'ACTIVE',
        baseSku: 'BASE-1',
        imageUrl: null as string | null,
        externalMaterial: null,
        images: [] as Array<{ url: string; position: number }>,
        variants: [variant],
      } as unknown as ReturnType<typeof makeProductRow>;
      const { service, client } = makeService({ products: [productWithoutCover] });

      await service.publishEligible(COMPANY_ID);

      expect(client.createItem.mock.calls[0][0]).toMatchObject({
        pictures: [{ source: 'https://cdn.example.com/variacao-azul.jpg' }],
      });
    },
  );

  it(
    'ACHADO REAL (relatado pelo usuário: "tá importando a mesma foto pra todas as variações"): ' +
      'cada cor mostra a PRÓPRIA foto como miniatura, nunca a mesma capa repetida em todas',
    async () => {
      // "Azul"/"Vermelho" são as duas cores do catálogo já mockadas em `makeClient()`.
      const azul = makeVariant({ id: 'variant-azul', sku: 'SKU-AZUL', color: 'Azul', imageUrl: 'https://cdn.example.com/azul.jpg', inventory: { onHand: 5, reserved: 0 } });
      const vermelho = makeVariant({ id: 'variant-vermelho', sku: 'SKU-VERMELHO', color: 'Vermelho', imageUrl: 'https://cdn.example.com/vermelho.jpg', inventory: { onHand: 5, reserved: 0 } });
      const { service, client } = makeService({
        products: [makeProductRow([azul, vermelho], { imageUrl: 'https://cdn.example.com/capa.jpg' })],
      });

      await service.publishEligible(COMPANY_ID);

      // Item base (cor "Azul", primeira variante) e item da cor adicional ("Vermelho") — cada um
      // precisa ter a PRÓPRIA foto em primeiro, nunca as duas mostrando a mesma capa.
      expect(client.createItem.mock.calls[0][0].pictures[0]).toEqual({ source: 'https://cdn.example.com/azul.jpg' });
      expect(client.createItem.mock.calls[1][0].pictures[0]).toEqual({ source: 'https://cdn.example.com/vermelho.jpg' });
    },
  );

  it(
    'DECISÃO DO USUÁRIO (confirmado via /item/performance real): preenche o atributo GENDER como ' +
      '"Feminino" quando a categoria tiver esse atributo, sem precisar cadastrar por produto',
    async () => {
      const variant = makeVariant();
      const client = makeClient();
      client.getCategoryAttributes = jest.fn().mockResolvedValue([
        { id: 'BRAND', values: [{ id: 'brand-generic', name: 'Generic' }] },
        { id: 'COLOR', values: [{ id: 'color-azul', name: 'Azul' }, { id: 'color-vermelho', name: 'Vermelho' }] },
        { id: 'GENDER', values: [{ id: 'gender-feminino', name: 'Feminino' }, { id: 'gender-masculino', name: 'Masculino' }] },
      ]);
      const { service } = makeService({ products: [makeProductRow([variant])], client });

      await service.publishEligible(COMPANY_ID);

      expect(client.createItem.mock.calls[0][0]).toMatchObject({
        attributes: expect.arrayContaining([{ id: 'GENDER', value_id: 'gender-feminino' }]),
      });
    },
  );

  it(
    'nunca falha nem envia o atributo GENDER quando a categoria não tiver esse atributo (ex.: cama/mesa/banho)',
    async () => {
      const variant = makeVariant();
      const { service, client } = makeService({ products: [makeProductRow([variant])] });

      await service.publishEligible(COMPANY_ID);

      const attributes = client.createItem.mock.calls[0][0].attributes as Array<{ id: string }>;
      expect(attributes.find((a) => a.id === 'GENDER')).toBeUndefined();
    },
  );

  it(
    'PEDIDO DO USUÁRIO (ficha técnica, confirmado via /item/performance real): preenche EXTERNAL_MATERIAL ' +
      'quando o produto tem o material cadastrado',
    async () => {
      const variant = makeVariant();
      const client = makeClient();
      client.getCategoryAttributes = jest.fn().mockResolvedValue([
        { id: 'BRAND', values: [{ id: 'brand-generic', name: 'Generic' }] },
        { id: 'COLOR', values: [{ id: 'color-azul', name: 'Azul' }] },
        { id: 'EXTERNAL_MATERIAL', values: [{ id: 'material-couro', name: 'Couro' }, { id: 'material-plastico', name: 'Plástico' }] },
      ]);
      const product = makeProductRow([variant], { externalMaterial: 'COURO' });
      const { service } = makeService({ products: [product], client });

      await service.publishEligible(COMPANY_ID);

      expect(client.createItem.mock.calls[0][0]).toMatchObject({
        attributes: expect.arrayContaining([{ id: 'EXTERNAL_MATERIAL', value_id: 'material-couro' }]),
      });
    },
  );

  it('nunca envia EXTERNAL_MATERIAL quando o produto não tem o material cadastrado', async () => {
    const variant = makeVariant();
    const { service, client } = makeService({ products: [makeProductRow([variant])] });

    await service.publishEligible(COMPANY_ID);

    const attributes = client.createItem.mock.calls[0][0].attributes as Array<{ id: string }>;
    expect(attributes.find((a) => a.id === 'EXTERNAL_MATERIAL')).toBeUndefined();
  });

  it(
    'DECISÃO DO USUÁRIO: mapeia COURVIM pra "Couro" (couro sintético, o mais próximo real do catálogo) — ' +
      'PALHA fica sem enviar o atributo, já que o Mercado Livre não tem correspondente pra esse material',
    async () => {
      const client = makeClient();
      client.getCategoryAttributes = jest.fn().mockResolvedValue([
        { id: 'BRAND', values: [{ id: 'brand-generic', name: 'Generic' }] },
        { id: 'COLOR', values: [{ id: 'color-azul', name: 'Azul' }] },
        { id: 'EXTERNAL_MATERIAL', values: [{ id: 'material-couro', name: 'Couro' }, { id: 'material-plastico', name: 'Plástico' }] },
      ]);

      const courvim = makeVariant({ id: 'v-courvim' });
      client.createItem.mockResolvedValueOnce({ id: 'MLB-COURVIM', status: 'active' });
      const { service: serviceCourvim } = makeService({
        products: [makeProductRow([courvim], { externalMaterial: 'COURVIM' })],
        client,
      });
      await serviceCourvim.publishEligible(COMPANY_ID);
      expect(client.createItem.mock.calls[0][0]).toMatchObject({
        attributes: expect.arrayContaining([{ id: 'EXTERNAL_MATERIAL', value_id: 'material-couro' }]),
      });

      const palha = makeVariant({ id: 'v-palha' });
      client.createItem.mockResolvedValueOnce({ id: 'MLB-PALHA', status: 'active' });
      const { service: servicePalha } = makeService({
        products: [makeProductRow([palha], { id: 'product-2', baseSku: 'BASE-2', externalMaterial: 'PALHA' })],
        client,
      });
      await servicePalha.publishEligible(COMPANY_ID);
      const palhaAttributes = client.createItem.mock.calls[1][0].attributes as Array<{ id: string }>;
      expect(palhaAttributes.find((a) => a.id === 'EXTERNAL_MATERIAL')).toBeUndefined();
    },
  );

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
    'ACHADO REAL (2ª rodada, confirmado calculando as posições exatas reclamadas em produção): remove ' +
      'EMOJI da descrição também — sem nenhuma tag HTML, o Mercado Livre ainda rejeitava porque toda ' +
      'posição reclamada caía em cima de um emoji (✨🎨📏🧵💡🚚💳👉)',
    async () => {
      const variant = makeVariant();
      const product = makeProductRow([variant], {
        description: '<p><span>✨ Destaques do produto:</span></p><p><span>🎨 Cores disponíveis:</span></p>',
      });
      const { service, client } = makeService({ products: [product] });

      await service.publishEligible(COMPANY_ID);

      expect(client.setItemDescription).toHaveBeenCalledWith('MLB-NEW-1', 'Destaques do produto:\nCores disponíveis:');
    },
  );

  it(
    'ACHADO REAL (3ª rodada, mesmo produto ainda falhava mesmo sem emoji visível): remove o SELETOR DE ' +
      'VARIAÇÃO invisível (U+FE0F) que sobra depois de emoji tipo "⚠️"/"🛍️" — o emoji base some, mas o ' +
      'seletor sozinho continuava batendo na mesma validação, invisível em qualquer log/print',
    async () => {
      const variant = makeVariant();
      const product = makeProductRow([variant], {
        description: '<p><span>⚠️ Peça única</span></p><p><span>Garanta a sua antes que alguém leve. 🛍️</span></p>',
      });
      const { service, client } = makeService({ products: [product] });

      await service.publishEligible(COMPANY_ID);

      expect(client.setItemDescription).toHaveBeenCalledWith('MLB-NEW-1', 'Peça única\nGaranta a sua antes que alguém leve.');
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

  it('preenche GENDER também no item de cor adicional (não só no item base)', async () => {
    const azul = makeVariant({ id: 'v-azul', sku: 'SKU-AZUL', color: 'Azul', inventory: { onHand: 5, reserved: 0 } });
    const vermelho = makeVariant({ id: 'v-vermelho', sku: 'SKU-VERMELHO', color: 'Vermelho', inventory: { onHand: 0, reserved: 0 } });
    const client = makeClient();
    client.getCategoryAttributes = jest.fn().mockResolvedValue([
      { id: 'BRAND', values: [{ id: 'brand-generic', name: 'Generic' }] },
      { id: 'COLOR', values: [{ id: 'color-azul', name: 'Azul' }, { id: 'color-vermelho', name: 'Vermelho' }] },
      { id: 'GENDER', values: [{ id: 'gender-feminino', name: 'Feminino' }] },
    ]);
    client.createItem
      .mockResolvedValueOnce({ id: 'MLB-BASE', status: 'active' })
      .mockResolvedValueOnce({ id: 'MLB-COR-2', status: 'active' });
    const { service } = makeService({ products: [makeProductRow([azul, vermelho])], client });

    await service.publishEligible(COMPANY_ID);

    expect(client.createItem.mock.calls[1][0]).toMatchObject({
      attributes: expect.arrayContaining([{ id: 'GENDER', value_id: 'gender-feminino' }]),
    });
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
    'ACHADO REAL (confirmado no reset/republicação completa em produção): casa "Azul céu", "Mostarda" e ' +
      '"Rose" via sinônimo, sem precisar corrigir manualmente de novo',
    async () => {
      const client = makeClient();
      client.getCategoryAttributes = jest.fn().mockResolvedValue([
        { id: 'BRAND', values: [{ id: 'brand-generic', name: 'Generic' }] },
        {
          id: 'COLOR',
          values: [
            { id: 'color-azul-celeste', name: 'Azul-celeste' },
            { id: 'color-ocre', name: 'Ocre' },
            { id: 'color-rosa', name: 'Rosa' },
          ],
        },
      ]);
      const azulCeu = makeVariant({ id: 'v-azul-ceu', sku: 'SKU-AZUL-CEU', color: 'Azul céu' });
      client.createItem.mockResolvedValueOnce({ id: 'MLB-BASE', status: 'active' });
      const { service: serviceAzulCeu } = makeService({ products: [makeProductRow([azulCeu])], client });
      await serviceAzulCeu.publishEligible(COMPANY_ID);
      expect(client.updateItem).toHaveBeenCalledWith('MLB-BASE', { attributes: [{ id: 'COLOR', value_id: 'color-azul-celeste' }] });

      const mostarda = makeVariant({ id: 'v-mostarda-2', sku: 'SKU-MOSTARDA-2', color: 'Mostarda' });
      client.createItem.mockResolvedValueOnce({ id: 'MLB-BASE-2', status: 'active' });
      const { service: serviceMostarda } = makeService({ products: [makeProductRow([mostarda], { id: 'product-2', baseSku: 'BASE-2' })], client });
      await serviceMostarda.publishEligible(COMPANY_ID);
      expect(client.updateItem).toHaveBeenCalledWith('MLB-BASE-2', { attributes: [{ id: 'COLOR', value_id: 'color-ocre' }] });

      const rose = makeVariant({ id: 'v-rose', sku: 'SKU-ROSE', color: 'Rose' });
      client.createItem.mockResolvedValueOnce({ id: 'MLB-BASE-3', status: 'active' });
      const { service: serviceRose } = makeService({ products: [makeProductRow([rose], { id: 'product-3', baseSku: 'BASE-3' })], client });
      await serviceRose.publishEligible(COMPANY_ID);
      expect(client.updateItem).toHaveBeenCalledWith('MLB-BASE-3', { attributes: [{ id: 'COLOR', value_id: 'color-rosa' }] });
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

describe('MercadoLivreProductsSyncService.retryDescriptionPublish', () => {
  it(
    'ACHADO REAL (pedido do usuário: "ao tentar novamente, nada acontece, nem erro"): lança o erro real ' +
      'quando a descrição falha de novo na mesma tentativa manual, em vez de responder como sucesso',
    async () => {
      const client = makeClient();
      client.setItemDescription = jest.fn().mockRejectedValue(new Error('descrição rejeitada de novo'));
      const { service, variantFindFirst, mappingFindUnique, syncJobFindFirst } = makeService({ products: [], client });
      variantFindFirst.mockResolvedValue({ id: 'v-1', sku: 'SKU-1', product: { description: 'Descrição' } });
      mappingFindUnique.mockResolvedValue({ externalProductId: 'MLB-1' });
      syncJobFindFirst.mockResolvedValue({ id: 'job-1', status: 'FAILED', error: 'descrição rejeitada de novo' });

      await expect(service.retryDescriptionPublish(COMPANY_ID, 'v-1')).rejects.toThrow('descrição rejeitada de novo');
    },
  );

  it('resolve normalmente quando a nova tentativa de descrição dá certo', async () => {
    const client = makeClient();
    const { service, variantFindFirst, mappingFindUnique } = makeService({ products: [], client });
    variantFindFirst.mockResolvedValue({ id: 'v-1', sku: 'SKU-1', product: { description: 'Descrição' } });
    mappingFindUnique.mockResolvedValue({ externalProductId: 'MLB-1' });

    await expect(service.retryDescriptionPublish(COMPANY_ID, 'v-1')).resolves.toBeUndefined();
    expect(client.setItemDescription).toHaveBeenCalledWith('MLB-1', 'Descrição');
  });
});

describe('MercadoLivreProductsSyncService.retryColorPublish', () => {
  it(
    'ACHADO REAL (pedido do usuário: "ao tentar novamente, nada acontece, nem erro"): lança o erro real ' +
      'quando a cor do item BASE continua sem correspondência no catálogo na mesma tentativa manual',
    async () => {
      const client = makeClient();
      client.getItem.mockResolvedValue({ category_id: 'MLB123' });
      const { service, variantFindFirst, mappingFindUnique, syncJobFindFirst } = makeService({ products: [], client });
      variantFindFirst.mockResolvedValue({
        id: 'v-1',
        sku: 'SKU-1',
        color: 'Mostarda',
        size: null,
        status: 'ACTIVE',
        suggestedPrice: 100,
        imageUrl: null,
        inventory: null,
        product: { id: 'product-1', name: 'Bolsa Teste', description: null, status: 'ACTIVE', baseSku: 'BASE-1', imageUrl: null, images: [] },
      });
      mappingFindUnique.mockResolvedValue({ externalProductId: 'MLB-1' });
      syncJobFindFirst.mockResolvedValue({ id: 'job-1', status: 'FAILED', error: 'Cor "Mostarda" não encontrada' });

      await expect(service.retryColorPublish(COMPANY_ID, 'v-1')).rejects.toThrow('Cor "Mostarda" não encontrada');
    },
  );
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

  it(
    'ACHADO REAL (sync forçado): quando o Mercado Livre recusa ativar por falta de estoque do ' +
      'lado de lá, atualiza preço/fotos mesmo assim e NUNCA salva o hash (pra tentar ativar de novo no próximo ciclo)',
    async () => {
      const variant = makeVariant();
      const product = makeProductRow([variant]);
      const client = makeClient();
      const stockError = new MercadoLivreApiError('Validation error', 'VALIDATION', 400, undefined, {
        cause: [{ department: 'items', cause_id: 323, type: 'error', code: 'item.status.invalid', message: 'Is not possible to activate an item without stock.' }],
      });
      client.updateItem.mockRejectedValueOnce(stockError).mockResolvedValueOnce({});
      const { service, mappingUpdate } = makeService({
        products: [product],
        existingMappings: [
          { variantId: variant.id, externalProductId: 'MLB-1', syncStatus: ChannelMappingSyncStatus.CONFIRMED },
        ],
        client,
      });

      const result = await service.syncPublished(COMPANY_ID);

      expect(result).toEqual({ updated: 1, failed: 0, unchanged: 0 });
      expect(client.updateItem).toHaveBeenCalledTimes(2);
      expect(client.updateItem).toHaveBeenNthCalledWith(2, 'MLB-1', { price: 100, pictures: expect.any(Array) });
      expect(mappingUpdate).not.toHaveBeenCalled();
    },
  );

  it(
    'ACHADO REAL (sync forçado): quando o Mercado Livre responde rate limit, espera o Retry-After ' +
      'e tenta mais uma vez antes de contar como falha',
    async () => {
      const variant = makeVariant();
      const product = makeProductRow([variant]);
      const client = makeClient();
      const rateLimitError = new MercadoLivreApiError('Rate limit excedido pelo Mercado Livre', 'RATE_LIMIT', 429, 0);
      client.updateItem.mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce({});
      const { service } = makeService({
        products: [product],
        existingMappings: [
          { variantId: variant.id, externalProductId: 'MLB-1', syncStatus: ChannelMappingSyncStatus.CONFIRMED },
        ],
        client,
      });

      const result = await service.syncPublished(COMPANY_ID);

      expect(result).toEqual({ updated: 1, failed: 0, unchanged: 0 });
      expect(client.updateItem).toHaveBeenCalledTimes(2);
    },
  );

  it(
    'ACHADO REAL (item em revisão no Mercado Livre, "status:under_review", não aceita nenhuma ' +
      'atualização): conta como falha só UMA vez e nunca tenta de novo (erro não é de rate limit)',
    async () => {
      const variant = makeVariant();
      const product = makeProductRow([variant]);
      const client = makeClient();
      const underReviewError = new MercadoLivreApiError('Cannot update item MLB-1 [status:under_review, has_bids:false]', 'VALIDATION', 400, undefined, {
        cause: [{ department: 'items', cause_id: 340, type: 'error', code: 'item.status.not_modifiable', message: 'status is not modifiable.' }],
      });
      client.updateItem.mockRejectedValue(underReviewError);
      const { service, mappingUpdate } = makeService({
        products: [product],
        existingMappings: [
          { variantId: variant.id, externalProductId: 'MLB-1', syncStatus: ChannelMappingSyncStatus.CONFIRMED },
        ],
        client,
      });

      const result = await service.syncPublished(COMPANY_ID);

      expect(result).toEqual({ updated: 0, failed: 1, unchanged: 0 });
      expect(client.updateItem).toHaveBeenCalledTimes(1);
      expect(mappingUpdate).not.toHaveBeenCalled();
    },
  );

  it(
    'ACHADO REAL (sync forçado): quando o SKU já tem dados fiscais registrados (409 CONFLICT no ' +
      'POST), reenvia via PUT /items/fiscal_information/{sku} em vez de falhar em silêncio',
    async () => {
      const variant = makeVariant({ costHistory: [{ cost: 45.5 }] });
      const product = makeProductRow([variant], { categoryId: 'category-1' });
      const client = makeClient();
      client.setFiscalInformation.mockRejectedValueOnce(
        new MercadoLivreApiError('There is already a sku: SKU-1', 'PERMANENT', 409, undefined, { error_code: '409 CONFLICT' }),
      );
      const { service, fiscalProfileFindUnique } = makeService({
        products: [product],
        existingMappings: [
          { variantId: variant.id, externalProductId: 'MLB-1', syncStatus: ChannelMappingSyncStatus.CONFIRMED },
        ],
        client,
      });
      fiscalProfileFindUnique.mockResolvedValue({
        ncm: '42022210',
        cest: null,
        exTipi: null,
        csosn: '102',
        unidadeMedida: 'UN',
        origem: '0',
        fichaConteudoImportacao: null,
      });

      await service.syncPublished(COMPANY_ID);

      expect(client.updateFiscalInformation).toHaveBeenCalledWith('SKU-1', expect.objectContaining({ sku: 'SKU-1' }));
    },
  );

  it(
    'ACHADO REAL (API "Enviar Dados Fiscais" confirmada pelo usuário): envia os dados fiscais ' +
      'quando a categoria tem CategoryFiscalProfile configurado e a variação tem custo cadastrado',
    async () => {
      const variant = makeVariant({ barcode: '7891234567890', costHistory: [{ cost: 45.5 }] });
      const product = makeProductRow([variant], { categoryId: 'category-1' });
      const client = makeClient();
      const { service, fiscalProfileFindUnique } = makeService({
        products: [product],
        existingMappings: [
          { variantId: variant.id, externalProductId: 'MLB-1', syncStatus: ChannelMappingSyncStatus.CONFIRMED },
        ],
        client,
      });
      fiscalProfileFindUnique.mockResolvedValue({
        ncm: '42022210',
        cest: null,
        exTipi: null,
        csosn: '102',
        unidadeMedida: 'UN',
        origem: '0',
        fichaConteudoImportacao: null,
      });

      await service.syncPublished(COMPANY_ID);

      expect(client.setFiscalInformation).toHaveBeenCalledWith({
        sku: 'SKU-1',
        title: 'Bolsa Teste',
        type: 'single',
        measurement_unit: 'UN',
        cost: 45.5,
        tax_information: {
          ncm: '42022210',
          origin_type: 'reseller',
          origin_detail: '0',
          csosn: '102',
          ean: '7891234567890',
        },
      });
    },
  );

  it('nunca envia dados fiscais quando a categoria não tem CategoryFiscalProfile configurado (nunca inventa dado)', async () => {
    const variant = makeVariant({ costHistory: [{ cost: 45.5 }] });
    const product = makeProductRow([variant]);
    const client = makeClient();
    const { service } = makeService({
      products: [product],
      existingMappings: [
        { variantId: variant.id, externalProductId: 'MLB-1', syncStatus: ChannelMappingSyncStatus.CONFIRMED },
      ],
      client,
    });
    // `fiscalProfileFindUnique` já resolve `null` por padrão em `makeService`.

    await service.syncPublished(COMPANY_ID);

    expect(client.setFiscalInformation).not.toHaveBeenCalled();
  });

  it('nunca envia dados fiscais quando a variação não tem custo cadastrado (nunca inventa um valor)', async () => {
    const variant = makeVariant({ costHistory: [] });
    const product = makeProductRow([variant], { categoryId: 'category-1' });
    const client = makeClient();
    const { service, fiscalProfileFindUnique } = makeService({
      products: [product],
      existingMappings: [
        { variantId: variant.id, externalProductId: 'MLB-1', syncStatus: ChannelMappingSyncStatus.CONFIRMED },
      ],
      client,
    });
    fiscalProfileFindUnique.mockResolvedValue({
      ncm: '42022210',
      cest: null,
      exTipi: null,
      csosn: '102',
      unidadeMedida: 'UN',
      origem: '0',
      fichaConteudoImportacao: null,
    });

    await service.syncPublished(COMPANY_ID);

    expect(client.setFiscalInformation).not.toHaveBeenCalled();
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
        barcode: null,
        costHistory: [],
        product,
      },
    ]);

    const result = await service.syncPublished(COMPANY_ID);

    expect(result.updated).toBe(1);
    expect(client.updateItem).toHaveBeenCalledWith('MLB-1', expect.objectContaining({ status: 'paused' }));
  });
});
