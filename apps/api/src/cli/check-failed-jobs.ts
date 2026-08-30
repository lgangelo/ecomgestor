/* eslint-disable no-console */
/**
 * Diagnóstico direto dos 2 itens de "Precisa da sua atenção" do dashboard que ainda não foram
 * investigados: "falha(s) de sincronização TikTok" (SyncJob FAILED) e "produtos TikTok sem
 * vínculo" (Order com integrationSyncStatus REQUIRES_MAPPING). Não altera nada, só lê.
 *
 * Uso:
 *   npm run check-failed-jobs
 */
import { PrismaClient } from '@ecommerce-manager/database';

const prisma = new PrismaClient();

async function main() {
  const failedJobs = await prisma.syncJob.findMany({
    where: { status: 'FAILED' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      type: true,
      errorCategory: true,
      error: true,
      relatedExternalId: true,
      attempts: true,
      maxAttempts: true,
      createdAt: true,
    },
  });

  console.log(`Total de SyncJob FAILED: ${failedJobs.length}`);
  console.log('----------------------------------------------------');
  console.log('Agrupado por type + errorCategory:');
  const groups = new Map<string, number>();
  for (const job of failedJobs) {
    const key = `${job.type} | ${job.errorCategory ?? 'sem categoria'}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  for (const [key, count] of [...groups.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count}x  ${key}`);
  }

  console.log('----------------------------------------------------');
  console.log('Amostra (10 mais recentes):');
  for (const job of failedJobs.slice(0, 10)) {
    console.log(
      `  [${job.createdAt.toISOString()}] type=${job.type} relatedExternalId=${job.relatedExternalId ?? '—'} attempts=${job.attempts}/${job.maxAttempts} error=${job.error}`,
    );
  }

  console.log('======================================================');

  const unmappedOrders = await prisma.order.findMany({
    where: { integrationSyncStatus: 'REQUIRES_MAPPING' },
    select: {
      id: true,
      externalOrderId: true,
      orderDate: true,
      status: true,
      channel: { select: { name: true } },
      items: {
        select: { productNameAtSale: true, externalSku: true, variantId: true },
      },
    },
  });

  console.log(`Total de Order com integrationSyncStatus=REQUIRES_MAPPING: ${unmappedOrders.length}`);
  for (const order of unmappedOrders) {
    console.log(`  Pedido ${order.externalOrderId} (${order.channel.name}, status=${order.status}, data=${order.orderDate.toISOString()})`);
    for (const item of order.items) {
      console.log(
        `    item: nome="${item.productNameAtSale}" externalSku=${item.externalSku} variantId=${item.variantId ?? 'NENHUM (não vinculado)'}`,
      );
    }
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
