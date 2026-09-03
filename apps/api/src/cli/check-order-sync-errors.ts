/* eslint-disable no-console */
/**
 * Diagnóstico dos pedidos com `integrationSyncStatus = ERROR` (coluna "Sincronização" na tela de
 * Pedidos) — agrupa por `integrationIssue` (a mensagem gravada em `orders.service.ts` no momento
 * do erro: status externo desconhecido ou falha ao ajustar estoque na transição de status) pra
 * separar "é sempre o mesmo motivo" de "vários motivos diferentes misturados".
 *
 * Uso:
 *   npm run check-order-sync-errors
 */
import { PrismaClient } from '@ecommerce-manager/database';

const prisma = new PrismaClient();

async function main() {
  const errorOrders = await prisma.order.findMany({
    where: { integrationSyncStatus: 'ERROR' },
    select: {
      id: true,
      externalOrderId: true,
      customerName: true,
      status: true,
      externalStatus: true,
      integrationIssue: true,
      orderDate: true,
    },
    orderBy: { orderDate: 'desc' },
  });

  console.log(`Total de pedidos com status de sincronização ERROR: ${errorOrders.length}`);
  console.log('----------------------------------------------------');

  const byIssue = new Map<string, typeof errorOrders>();
  for (const o of errorOrders) {
    const key = o.integrationIssue ?? '(sem mensagem gravada)';
    if (!byIssue.has(key)) byIssue.set(key, []);
    byIssue.get(key)!.push(o);
  }

  for (const [issue, orders] of byIssue) {
    console.log(`Motivo: "${issue}" — ${orders.length} pedido(s)`);
    for (const o of orders.slice(0, 10)) {
      console.log(
        `  externalOrderId=${o.externalOrderId} cliente="${o.customerName ?? ''}" status=${o.status} externalStatus="${o.externalStatus}" orderDate=${o.orderDate.toISOString()}`,
      );
    }
    if (orders.length > 10) console.log(`  ... e mais ${orders.length - 10}`);
    console.log('----------------------------------------------------');
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
