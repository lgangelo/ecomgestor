/* eslint-disable no-console */
/**
 * Diagnóstico direto: consulta `marketplace_fees` via Prisma puro, sem passar pela tela
 * Financeiro > Taxas nem pela API — se a tabela realmente estiver vazia, o problema é na
 * GRAVAÇÃO; se tiver linhas mas a tela não mostrar nada, o problema é na LEITURA.
 *
 * Passando um `externalOrderId` (o número do pedido, ex.: 585708424139409308) como argumento,
 * também verifica ESSE pedido especificamente: se ele existe, se tem alguma
 * `SettlementTransaction` (prova de que a sincronização financeira alcançou esse pedido) e se
 * tem `MarketplaceFee` (prova de que a taxa foi gravada). Isso separa "a sincronização nunca
 * buscou esse pedido" de "buscou mas não gravou a taxa".
 *
 * Uso:
 *   npm run check-marketplace-fees
 *   npm run check-marketplace-fees -- 585708424139409308
 */
import { PrismaClient } from '@ecommerce-manager/database';

const prisma = new PrismaClient();

async function main() {
  const total = await prisma.marketplaceFee.count();
  console.log(`Total de linhas em marketplace_fees: ${total}`);

  const sample = await prisma.marketplaceFee.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: { channel: { select: { name: true, companyId: true } } },
  });
  for (const row of sample) {
    console.log(JSON.stringify(row, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)));
  }

  const externalOrderId = process.argv[2];
  if (!externalOrderId) return;

  console.log('----------------------------------------------------');
  console.log(`Verificando pedido externo: ${externalOrderId}`);
  const order = await prisma.order.findFirst({ where: { externalOrderId } });
  if (!order) {
    console.log('Pedido não encontrado no nosso banco (externalOrderId não bate com nenhum pedido).');
    return;
  }
  console.log(`Pedido encontrado: id=${order.id}, status=${order.status}, channelId=${order.channelId}`);

  const settlementTx = await prisma.settlementTransaction.findMany({ where: { orderId: order.id } });
  console.log(`SettlementTransaction para este pedido: ${settlementTx.length}`);
  for (const tx of settlementTx) {
    console.log(`  type=${tx.type} rawType=${tx.rawType} amount=${tx.amount} externalTransactionId=${tx.externalTransactionId}`);
  }

  const fees = await prisma.marketplaceFee.findMany({ where: { orderId: order.id } });
  console.log(`MarketplaceFee para este pedido: ${fees.length}`);
  for (const fee of fees) {
    console.log(`  feeType=${fee.feeType} amount=${fee.amount}`);
  }
}

main()
  .catch((err) => {
    console.error('Erro na consulta:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
