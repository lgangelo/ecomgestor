import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../common/prisma/prisma.service';
import { ProductsService } from './products.service';

const COMPANY_ID = 'company-1';

function product(id: string, onHand: number, reserved: number) {
  return {
    id,
    name: `Produto ${id}`,
    baseSku: id,
    brand: null,
    status: 'ACTIVE',
    imageUrl: null,
    category: null,
    createdAt: new Date(),
    variants: [{ suggestedPrice: '10.00', inventory: { onHand, reserved } }],
  };
}

describe('ProductsService.findAll — filtro "só com estoque" (hasStock)', () => {
  it('sem o filtro: pagina no banco normalmente (skip/take), inclui produtos com saldo zero', async () => {
    const findMany = jest.fn().mockResolvedValue([product('p1', 0, 0)]);
    const count = jest.fn().mockResolvedValue(1);
    const prisma = { client: { product: { findMany, count } } };
    const service = new ProductsService(prisma as unknown as PrismaService, {} as ConfigService, {} as never);

    const result = await service.findAll(COMPANY_ID, { page: 1, pageSize: 20 } as never);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 20 }));
    expect(count).toHaveBeenCalledTimes(1);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('com o filtro: nunca inclui produto com saldo total zero ou negativo, e o total/paginação refletem só os filtrados', async () => {
    // 5 produtos: 3 com saldo > 0, 2 com saldo <= 0 (um exatamente 0, outro negativo por
    // reserva maior que o físico — nunca deveria aparecer nem esse).
    const all = [
      product('com-estoque-1', 5, 0),
      product('sem-estoque-1', 0, 0),
      product('com-estoque-2', 3, 1),
      product('negativo', 2, 3),
      product('com-estoque-3', 10, 2),
    ];
    const findMany = jest.fn().mockResolvedValue(all);
    const count = jest.fn();
    const prisma = { client: { product: { findMany, count } } };
    const service = new ProductsService(prisma as unknown as PrismaService, {} as ConfigService, {} as never);

    const result = await service.findAll(COMPANY_ID, { page: 1, pageSize: 2, hasStock: true } as never);

    // Nunca paginou no banco (busca tudo, filtra e pagina em memória).
    expect(findMany).toHaveBeenCalledWith(expect.not.objectContaining({ skip: expect.anything(), take: expect.anything() }));
    expect(count).not.toHaveBeenCalled();

    expect(result.total).toBe(3); // só os 3 com saldo real positivo
    expect(result.items).toHaveLength(2); // pageSize=2
    expect(result.items.every((i) => i.totalAvailable > 0)).toBe(true);
    expect(result.totalPages).toBe(2);
  });
});
