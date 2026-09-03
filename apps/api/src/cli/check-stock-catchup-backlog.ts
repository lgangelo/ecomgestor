/* eslint-disable no-console */
/**
 * Lista TODOS os pedidos com baixa de estoque ainda pendente (`status !== stockAppliedStatus`)
 * para uma ou mais variações — não só os que já falharam (`integrationSyncStatus = ERROR`).
 *
 * Motivo de existir: `reconcile-inventory-from-tiktok` somava de volta só a quantidade dos
 * pedidos passados explicitamente como argumento. Se existirem OUTROS pedidos represados na
 * mesma variação — que nunca tentaram de verdade ainda, então nunca viraram ERROR —, uma
 * reconciliação/sincronização geral ("Sincronizar agora") processa TODOS eles na mesma
 * execução, e o primeiro que conseguir consome a unidade recém-corrigida, deixando os demais
 * (inclusive o que a gente tinha acabado de destravar) de novo sem saldo. Este script mostra o
 * backlog REAL por variação antes de qualquer novo ajuste.
 *
 * Uso:
 *   npm run check-stock-catchup-backlog -- <variantId1> <variantId2> ...
 */
import { PrismaClient } from '@ecommerce-manager/database';

const prisma = new PrismaClient();

async function main() {
  const variantIds = process.argv.slice(2);
  if (variantIds.length === 0) {
    console.error('Uso: npm run check-stock-catchup-backlog -- <variantId1> <variantId2> ...');
    process.exitCode = 1;
    return;
  }

  for (const variantId of variantIds) {
    console.log('======================================================');
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { inventory: true, product: { select: { name: true } } },
    });
    if (!variant) {
      console.log(`Variante ${variantId}: não encontrada.`);
      continue;
    }
    console.log(`Variante ${variant.sku} (${variant.product.name})`);
    console.log(`  Saldo atual: onHand=${variant.inventory?.onHand ?? 0} reserved=${variant.inventory?.reserved ?? 0}`);

    const items = await prisma.orderItem.findMany({
      where: { variantId },
      select: {
        quantity: true,
        order: { select: { id: true, externalOrderId: true, status: true, stockAppliedStatus: true, orderDate: true } },
      },
      orderBy: { order: { orderDate: 'asc' } },
    });

    const pending = items.filter((i) => i.order.status !== i.order.stockAppliedStatus);
    const totalPendingQty = pending.reduce((sum, i) => sum + i.quantity, 0);

    console.log(`  Pedidos usando esta variação: ${items.length} — com baixa pendente: ${pending.length} (soma qty=${totalPendingQty})`);
    for (const i of pending) {
      console.log(
        `    externalOrderId=${i.order.externalOrderId} qty=${i.quantity} status=${i.order.status} stockAppliedStatus=${i.order.stockAppliedStatus} orderDate=${i.order.orderDate.toISOString()}`,
      );
    }
  }
}

main()
  .catch((err) => {
    console.error('Erro:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
