import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { R2StorageService } from '../common/storage/r2-storage.service';
import { ProductsService } from './products.service';

const COMPANY_ID = 'company-1';
const fakeConfig = {} as unknown as ConfigService;
const fakeR2Service = {} as unknown as R2StorageService;

function makeService(variants: Array<{ suggestedPrice: string }>, productStatus: 'DRAFT' | 'INACTIVE' | 'ACTIVE' = 'DRAFT') {
  const findFirst = jest.fn().mockResolvedValue({ id: 'product-1', companyId: COMPANY_ID, status: productStatus });
  const findMany = jest.fn().mockResolvedValue(variants);
  const update = jest.fn().mockImplementation(({ data }) => ({ id: 'product-1', ...data }));
  const updateMany = jest.fn();
  const transaction = jest.fn().mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({ product: { update }, productVariant: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() } }),
  );

  const create = jest.fn().mockImplementation(({ data }) => ({ id: 'product-1', ...data }));
  const prisma = {
    client: {
      product: {
        findFirst,
        update,
        updateMany,
        create,
        findMany: jest.fn().mockResolvedValue([{ id: 'product-1', variants }]),
      },
      productVariant: { findMany },
      $transaction: transaction,
    },
  };

  const service = new ProductsService(prisma as unknown as PrismaService, fakeConfig, fakeR2Service);
  return { service, update, updateMany };
}

describe('ProductsService — preço só é exigido pra ativar (pedido do usuário)', () => {
  it('bloqueia criar o produto já como Ativo', async () => {
    const { service } = makeService([]);
    await expect(service.create(COMPANY_ID, { name: 'X', baseSku: 'X-1', status: 'ACTIVE' } as any)).rejects.toThrow(
      /já como Ativo/,
    );
  });

  it('permite criar o produto como Rascunho, sem nenhuma variação ainda', async () => {
    const { service } = makeService([]);
    await expect(service.create(COMPANY_ID, { name: 'X', baseSku: 'X-1', status: 'DRAFT' } as any)).resolves.toBeDefined();
  });

  it('bloqueia ativar o produto quando nenhuma variação tem preço sugerido > 0', async () => {
    const { service } = makeService([{ suggestedPrice: '0' }, { suggestedPrice: '0' }]);
    await expect(service.update('product-1', COMPANY_ID, { status: 'ACTIVE' } as any)).rejects.toThrow(
      /sem preço sugerido/,
    );
  });

  it('permite ativar o produto quando pelo menos uma variação tem preço sugerido > 0', async () => {
    const { service } = makeService([{ suggestedPrice: '0' }, { suggestedPrice: '49.9' }]);
    await expect(service.update('product-1', COMPANY_ID, { status: 'ACTIVE' } as any)).resolves.toBeDefined();
  });

  it('updateManyStatus: separa os produtos sem preço em blockedNoPrice, sem travar os demais', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'product-com-preco', variants: [{ suggestedPrice: '10' }] },
      { id: 'product-sem-preco', variants: [{ suggestedPrice: '0' }] },
    ]);
    const updateMany = jest.fn();
    const prisma = {
      client: { product: { findMany, updateMany } },
    };
    const service = new ProductsService(prisma as unknown as PrismaService, fakeConfig, fakeR2Service);

    const result = await service.updateManyStatus(['product-com-preco', 'product-sem-preco'], COMPANY_ID, 'ACTIVE' as any);

    expect(result.updated).toEqual(['product-com-preco']);
    expect(result.blockedNoPrice).toEqual(['product-sem-preco']);
    expect(updateMany).toHaveBeenCalledWith({ where: { id: { in: ['product-com-preco'] } }, data: { status: 'ACTIVE' } });
  });
});
