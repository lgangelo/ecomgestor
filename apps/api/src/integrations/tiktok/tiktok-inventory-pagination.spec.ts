import { TikTokClient, TikTokConnector } from '@ecommerce-manager/integrations';

function rawSku(id: string, quantity: number) {
  return { id, price: { tax_inclusive_price: '10.00' }, inventory: [{ quantity }] };
}

function rawProduct(id: string, skuId: string, quantity: number) {
  return { id, title: `Produto ${id}`, skus: [rawSku(skuId, quantity)] };
}

describe('TikTokConnector.getInventory — pagina sozinho até esgotar, nunca só a primeira página', () => {
  it('agrega SKUs de todas as páginas quando next_page_token indica que há mais', async () => {
    let call = 0;
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(async () => {
      call++;
      const body =
        call === 1
          ? { code: 0, message: 'ok', data: { products: [rawProduct('p1', 'sku-1', 5)], next_page_token: 'page-2' } }
          : { code: 0, message: 'ok', data: { products: [rawProduct('p2', 'sku-2', 8)] } };
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => body };
    });

    const client = new TikTokClient({ appKey: 'k', appSecret: 's', accessToken: 'token' });
    const connector = new TikTokConnector(client);

    const result = await connector.getInventory('company-1', { externalSkus: ['sku-1', 'sku-2'] });

    expect(call).toBe(2);
    expect(result).toEqual(
      expect.arrayContaining([
        { externalSku: 'sku-1', available: 5 },
        { externalSku: 'sku-2', available: 8 },
      ]),
    );
    expect(result).toHaveLength(2);
  });

  it('para na primeira página quando não há next_page_token (sem paginar à toa)', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ code: 0, message: 'ok', data: { products: [rawProduct('p1', 'sku-1', 5)] } }),
      });

    const client = new TikTokClient({ appKey: 'k', appSecret: 's', accessToken: 'token' });
    const connector = new TikTokConnector(client);

    const result = await connector.getInventory('company-1', { externalSkus: ['sku-1'] });

    expect((global as unknown as { fetch: jest.Mock }).fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ externalSku: 'sku-1', available: 5 }]);
  });
});
