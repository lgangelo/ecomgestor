/* eslint-disable no-console */
/**
 * Backfill único do nome do cliente para pedidos TikTok já importados sem `customerName`
 * (importados antes do mapeamento `recipient_address.name` funcionar de verdade nesta loja).
 * Rebusca cada pedido pelo ID (mesmo `Get Order` já usado no botão "Sincronizar com TikTok") e
 * atualiza SÓ o nome — nunca mexe em status nem em estoque, para não repetir nenhum efeito já
 * aplicado.
 *
 * Uso:
 *   npm run backfill-order-customer-name
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { TikTokConnectorFactory } from '../integrations/tiktok/tiktok-connector.factory';

async function main() {
  const prisma = new PrismaClient();
  const orders = await prisma.order.findMany({
    where: {
      channel: { type: 'TIKTOK_SHOP' },
      externalOrderId: { not: null },
      OR: [{ customerName: null }, { customerName: '' }],
    },
    select: { id: true, companyId: true, externalOrderId: true },
  });
  await prisma.$disconnect();

  console.log(`Pedidos TikTok sem nome de cliente: ${orders.length}`);
  if (orders.length === 0) return;

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const connectorFactory = app.get(TikTokConnectorFactory);
    const client = new PrismaClient();

    let updated = 0;
    let stillEmpty = 0;
    let failed = 0;

    for (const order of orders) {
      try {
        const { connector } = await connectorFactory.forCompany(order.companyId);
        const fresh = await connector.getOrder(order.companyId, order.externalOrderId!);
        if (fresh.customerName) {
          await client.order.update({ where: { id: order.id }, data: { customerName: fresh.customerName } });
          updated++;
        } else {
          stillEmpty++;
        }
      } catch (error) {
        failed++;
        console.error(`  falha no pedido ${order.externalOrderId}: ${(error as Error).message}`);
      }
    }

    await client.$disconnect();
    console.log('----------------------------------------------------');
    console.log(`Atualizados: ${updated}`);
    console.log(`Continuam sem nome (TikTok também não retornou): ${stillEmpty}`);
    console.log(`Falhas: ${failed}`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro no backfill:', err.message ?? err);
  process.exitCode = 1;
});
