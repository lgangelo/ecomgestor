/* eslint-disable no-console */
/**
 * Recalcula `discount`/`total` dos pedidos já importados (rodar UMA VEZ depois do fix que trocou
 * "sellerDiscount + platformDiscount" por só "sellerDiscount" no cálculo do valor do pedido —
 * ver orders.service.ts). Pedidos importados ANTES desse fix ficaram com o valor antigo gravado
 * no banco; a correção do código sozinha só vale para pedidos novos, então este script existe
 * para atualizar os que já existem, usando os mesmos `sellerDiscount` por item já salvos (nunca
 * refaz a busca na TikTok — só reaplica a fórmula certa sobre o que já está no banco).
 *
 * Uso:
 *   npm run recompute-order-totals
 */
import { PrismaClient } from '@ecommerce-manager/database';

const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.order.findMany({ include: { items: true } });

  let updated = 0;
  for (const order of orders) {
    const discount = order.items.reduce((sum, item) => sum + Number(item.sellerDiscount), 0);
    const total = Number(order.subtotal) - discount + Number(order.shipping);

    if (round2(Number(order.discount)) === round2(discount) && round2(Number(order.total)) === round2(total)) {
      continue;
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { discount, total },
    });
    updated++;
  }

  console.log('----------------------------------------------------');
  console.log(`Pedidos verificados: ${orders.length}`);
  console.log(`Pedidos corrigidos: ${updated}`);
  console.log('----------------------------------------------------');
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

main()
  .catch((err) => {
    console.error('Erro ao recalcular pedidos:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
