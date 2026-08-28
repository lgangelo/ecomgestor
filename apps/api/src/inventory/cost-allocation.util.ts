export interface AllocationInput {
  variantId: string;
  quantity: number;
  unitCost: number;
}

export interface AllocationResult {
  variantId: string;
  quantity: number;
  unitCost: number;
  allocatedExtra: number;
  effectiveUnitCost: number;
}

/**
 * Rateia frete + outras despesas entre os itens de uma entrada de estoque (seção 6).
 * Determinístico: os centavos de arredondamento sempre sobram para o ÚLTIMO item da lista,
 * garantindo que a soma dos valores rateados seja exatamente igual a `totalExtra` (nunca um
 * pouco mais ou um pouco menos por causa de arredondamento por item).
 *
 * BY_VALUE (padrão): proporcional ao valor total de cada item (quantity × unitCost) — correto
 * quando os produtos têm preços diferentes; simplesmente dividir pela quantidade distorceria o
 * custo de itens baratos versus caros.
 * BY_QUANTITY: proporcional à quantidade de unidades de cada item.
 */
export function allocateCosts(
  items: AllocationInput[],
  totalExtra: number,
  method: 'BY_VALUE' | 'BY_QUANTITY',
): AllocationResult[] {
  if (items.length === 0) return [];

  const extraCents = Math.round(totalExtra * 100);
  if (extraCents === 0) {
    return items.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
      unitCost: item.unitCost,
      allocatedExtra: 0,
      effectiveUnitCost: item.unitCost,
    }));
  }

  const totalItemsValueCents = items.reduce(
    (sum, item) => sum + Math.round(item.unitCost * 100) * item.quantity,
    0,
  );
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  const useByValue = method === 'BY_VALUE' && totalItemsValueCents > 0;

  let allocatedSoFarCents = 0;
  const results: AllocationResult[] = items.map((item, index) => {
    const isLast = index === items.length - 1;
    let shareCents: number;

    if (isLast) {
      shareCents = extraCents - allocatedSoFarCents;
    } else if (useByValue) {
      const itemValueCents = Math.round(item.unitCost * 100) * item.quantity;
      shareCents = Math.round((extraCents * itemValueCents) / totalItemsValueCents);
    } else {
      shareCents = Math.round((extraCents * item.quantity) / totalQuantity);
    }

    allocatedSoFarCents += shareCents;
    const allocatedExtra = shareCents / 100;
    const effectiveUnitCost = item.unitCost + allocatedExtra / item.quantity;

    return {
      variantId: item.variantId,
      quantity: item.quantity,
      unitCost: item.unitCost,
      allocatedExtra: Math.round(allocatedExtra * 100) / 100,
      effectiveUnitCost: Math.round(effectiveUnitCost * 100) / 100,
    };
  });

  return results;
}
