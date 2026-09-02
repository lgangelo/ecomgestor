/* eslint-disable no-console */
/**
 * Força a busca da taxa da plataforma de UM pedido específico direto na TikTok ("Get
 * Transactions by Order"), sem depender de achar o extrato certo entre os ~500 mais recentes da
 * varredura em lote (`syncStatements`/`check-marketplace-fees`) — mesmo caminho usado pelo botão
 * "Sincronizar com TikTok" na tela do pedido, só que direto por linha de comando, pra corrigir
 * vários pedidos presos de uma vez sem precisar abrir a tela um por um.
 *
 * Uso:
 *   npm run sync-order-finance -- 585791290192594588
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { TikTokFinanceSyncService } from '../integrations/tiktok/tiktok-finance-sync.service';

async function main() {
  const externalOrderId = process.argv[2];
  if (!externalOrderId) {
    console.error('Uso: npm run sync-order-finance -- <externalOrderId>');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  const order = await prisma.order.findFirst({ where: { externalOrderId }, select: { id: true, companyId: true } });
  await prisma.$disconnect();
  if (!order) {
    console.error(`Nenhum pedido encontrado com externalOrderId=${externalOrderId}.`);
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const financeSync = app.get(TikTokFinanceSyncService);
    const { feesFound } = await financeSync.syncOrderFee(order.companyId, order.id);
    console.log(
      feesFound > 0
        ? `Taxa encontrada e gravada: ${feesFound} transação(ões) para o pedido ${externalOrderId}.`
        : `Nenhuma transação encontrada ainda na TikTok para o pedido ${externalOrderId} — provavelmente a liquidação ainda não aconteceu do lado deles.`,
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
