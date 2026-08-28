import { allocateCosts } from './cost-allocation.util';

describe('allocateCosts', () => {
  it('rateia proporcionalmente ao valor quando os itens têm preços diferentes (BY_VALUE)', () => {
    // Exemplo do enunciado: produtos R$ 1.950 + frete R$ 150 + outros R$ 30 = R$ 180 a ratear.
    const items = [
      { variantId: 'a', quantity: 10, unitCost: 150 }, // valor: 1500
      { variantId: 'b', quantity: 5, unitCost: 90 }, // valor: 450
    ];
    const result = allocateCosts(items, 180, 'BY_VALUE');

    // item a: 1500/1950 * 180 = 138.46 -> ~138.46; item b resto = 180 - 138.46 = 41.54
    expect(result[0].allocatedExtra).toBeCloseTo(138.46, 1);
    expect(result[1].allocatedExtra).toBeCloseTo(41.54, 1);

    const totalAllocated = result.reduce((sum, r) => sum + r.allocatedExtra, 0);
    expect(Math.round(totalAllocated * 100) / 100).toBe(180);
  });

  it('não usa divisão simples pela quantidade quando os preços diferem', () => {
    const items = [
      { variantId: 'expensive', quantity: 1, unitCost: 1000 },
      { variantId: 'cheap', quantity: 1, unitCost: 10 },
    ];
    const result = allocateCosts(items, 100, 'BY_VALUE');

    // Dividir igualmente (50/50) estaria errado — o item caro deve absorver quase tudo.
    const expensive = result.find((r) => r.variantId === 'expensive')!;
    const cheap = result.find((r) => r.variantId === 'cheap')!;
    expect(expensive.allocatedExtra).toBeGreaterThan(cheap.allocatedExtra);
    expect(expensive.allocatedExtra).toBeCloseTo(99.01, 1);
  });

  it('rateia por quantidade quando o método é BY_QUANTITY', () => {
    const items = [
      { variantId: 'a', quantity: 3, unitCost: 100 },
      { variantId: 'b', quantity: 1, unitCost: 500 },
    ];
    const result = allocateCosts(items, 40, 'BY_QUANTITY');

    const a = result.find((r) => r.variantId === 'a')!;
    const b = result.find((r) => r.variantId === 'b')!;
    expect(a.allocatedExtra).toBeCloseTo(30, 1); // 3/4 de 40
    expect(b.allocatedExtra).toBeCloseTo(10, 1); // 1/4 de 40
  });

  it('a soma dos valores rateados nunca diverge do total por arredondamento', () => {
    const items = [
      { variantId: 'a', quantity: 7, unitCost: 33.33 },
      { variantId: 'b', quantity: 3, unitCost: 17.77 },
      { variantId: 'c', quantity: 11, unitCost: 5.01 },
    ];
    const result = allocateCosts(items, 99.99, 'BY_VALUE');
    const total = result.reduce((sum, r) => sum + r.allocatedExtra, 0);
    expect(Math.round(total * 100) / 100).toBe(99.99);
  });

  it('retorna custo efetivo igual ao custo original quando não há despesas a ratear', () => {
    const items = [{ variantId: 'a', quantity: 5, unitCost: 42 }];
    const result = allocateCosts(items, 0, 'BY_VALUE');
    expect(result[0].effectiveUnitCost).toBe(42);
    expect(result[0].allocatedExtra).toBe(0);
  });

  it('cai para rateio por quantidade quando o valor total dos itens é zero', () => {
    const items = [
      { variantId: 'a', quantity: 2, unitCost: 0 },
      { variantId: 'b', quantity: 2, unitCost: 0 },
    ];
    const result = allocateCosts(items, 20, 'BY_VALUE');
    expect(result[0].allocatedExtra).toBeCloseTo(10, 1);
    expect(result[1].allocatedExtra).toBeCloseTo(10, 1);
  });
});
