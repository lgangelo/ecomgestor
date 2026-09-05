import { TikTokConnector, TikTokClient } from '@ecommerce-manager/integrations';

describe('TikTokConnector.updateInventory', () => {
  function makeClient() {
    return { request: jest.fn().mockResolvedValue({}) } as unknown as jest.Mocked<TikTokClient>;
  }

  it(
    'ACHADO REAL: "Update Inventory" exige o product_id no PATH — chamar sem isso sempre dava ' +
      '"Invalid path" em produção (confirmado contra a doc oficial: ' +
      'POST /product/202309/products/{product_id}/inventory/update)',
    async () => {
      const client = makeClient();
      const connector = new TikTokConnector(client);

      await connector.updateInventory('company-1', [
        { externalProductId: 'prod-A', externalSku: 'SKU-1', available: 3 },
      ]);

      expect(client.request).toHaveBeenCalledWith(
        'POST',
        '/product/202309/products/prod-A/inventory/update',
        { body: { skus: [{ id: 'SKU-1', inventory: [{ quantity: 3 }] }] } },
      );
    },
  );

  it('agrupa atualizações de produtos diferentes em uma chamada por product_id', async () => {
    const client = makeClient();
    const connector = new TikTokConnector(client);

    await connector.updateInventory('company-1', [
      { externalProductId: 'prod-A', externalSku: 'SKU-1', available: 3 },
      { externalProductId: 'prod-B', externalSku: 'SKU-2', available: 5 },
      { externalProductId: 'prod-A', externalSku: 'SKU-1b', available: 0 },
    ]);

    expect(client.request).toHaveBeenCalledTimes(2);
    expect(client.request).toHaveBeenCalledWith('POST', '/product/202309/products/prod-A/inventory/update', {
      body: {
        skus: [
          { id: 'SKU-1', inventory: [{ quantity: 3 }] },
          { id: 'SKU-1b', inventory: [{ quantity: 0 }] },
        ],
      },
    });
    expect(client.request).toHaveBeenCalledWith('POST', '/product/202309/products/prod-B/inventory/update', {
      body: { skus: [{ id: 'SKU-2', inventory: [{ quantity: 5 }] }] },
    });
  });

  it(
    'ACHADO REAL: o envelope vem com code 0 (sucesso) mesmo quando data.errors reporta falha por SKU ' +
      '(ex.: "The warehouse does not exist") — precisa ser conferido explicitamente, ou o estoque nunca ' +
      'muda na TikTok e ninguém vê erro nenhum',
    async () => {
      const client = {
        request: jest.fn().mockResolvedValue({
          errors: [
            {
              code: 12052990,
              message: 'Check failed',
              detail: {
                sku_id: 'SKU-1',
                extra_errors: [{ warehouse_id: 'wh-1', code: 12052097, message: 'The warehouse does not exist' }],
              },
            },
          ],
        }),
      } as unknown as jest.Mocked<TikTokClient>;
      const connector = new TikTokConnector(client);

      await expect(
        connector.updateInventory('company-1', [{ externalProductId: 'prod-A', externalSku: 'SKU-1', available: 3 }]),
      ).rejects.toThrow(/The warehouse does not exist/);
    },
  );
});
