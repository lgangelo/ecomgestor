/* eslint-disable no-console */
/**
 * Recalcula `subtotal`/`discount`/`total` dos pedidos já importados (rodar UMA VEZ depois do fix
 * que corrigiu o cálculo do valor do pedido — ver orders.service.ts). Confirmado contra o
 * extrato real da TikTok (pedido 585794478920270934): `unitPrice` (sale_price) já vem LÍQUIDO
 * dos dois descontos, não é o preço de tabela. Fórmula certa por item:
 *   subtotal (preço de tabela) = unitPrice*qty + sellerDiscount + platformDiscount
 *   total (o que o vendedor recebe, antes das taxas)  = unitPrice*qty + platformDiscount
 *   discount (só informativo/soma de conferência)     = sellerDiscount
 * Pedidos importados ANTES desse fix ficaram com os três campos errados gravados no banco; a
 * correção do código sozinha só vale para pedidos novos, então este script existe para
 * atualizar os que já existem, usando os mesmos unitPrice/sellerDiscount/platformDiscount por
 * item já salvos (nunca refaz a busca na TikTok — só reaplica a fórmula certa).
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
    const subtotal = order.items.reduce(
      (sum, item) =>
        sum + Number(item.unitPrice) * item.quantity + Number(item.sellerDiscount) + Number(item.platformDiscount),
      0,
    );
    const discount = order.items.reduce((sum, item) => sum + Number(item.sellerDiscount), 0);
    const total = subtotal - discount + Number(order.shipping);

    const unchanged =
      round2(Number(order.subtotal)) === round2(subtotal) &&
      round2(Number(order.discount)) === round2(discount) &&
      round2(Number(order.total)) === round2(total);
    if (unchanged) continue;

    await prisma.order.update({
      where: { id: order.id },
      data: { subtotal, discount, total },
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
