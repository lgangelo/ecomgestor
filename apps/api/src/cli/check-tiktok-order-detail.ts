/* eslint-disable no-console */
/**
 * Dump do payload BRUTO que a TikTok devolve para um pedido específico ("Get Order") — usado
 * para confirmar, contra dados reais, se um pedido ainda não pago (status CREATED) já vem com
 * algum campo identificando o cliente (nome, endereço, apelido) antes do pagamento, ou se esses
 * campos só aparecem depois — sem isso, `normalizeOrder` (tiktok.mapper.ts) fica adivinhando.
 * Sem argumento, pega automaticamente o pedido CREATED mais recente da empresa.
 *
 * Uso:
 *   npm run check-tiktok-order-detail
 *   npm run check-tiktok-order-detail -- 584612868964910745
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { TikTokConnectorFactory } from '../integrations/tiktok/tiktok-connector.factory';

async function main() {
  const prisma = new PrismaClient();
  let companyId: string;
  let externalOrderId = process.argv[2];

  if (externalOrderId) {
    const order = await prisma.order.findFirst({
      where: { externalOrderId, channel: { type: 'TIKTOK_SHOP' } },
      select: { companyId: true },
    });
    if (!order) {
      console.error(`Nenhum pedido TikTok encontrado com externalOrderId=${externalOrderId}.`);
      await prisma.$disconnect();
      process.exitCode = 1;
      return;
    }
    companyId = order.companyId;
  } else {
    const order = await prisma.order.findFirst({
      where: { status: 'CREATED', channel: { type: 'TIKTOK_SHOP' }, externalOrderId: { not: null } },
      orderBy: { orderDate: 'desc' },
      select: { companyId: true, externalOrderId: true },
    });
    if (!order) {
      console.error('Nenhum pedido CREATED (não pago) da TikTok encontrado para usar como amostra.');
      await prisma.$disconnect();
      process.exitCode = 1;
      return;
    }
    companyId = order.companyId;
    externalOrderId = order.externalOrderId!;
  }
  await prisma.$disconnect();

  console.log(`Consultando pedido ${externalOrderId} direto na TikTok...`);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const connectorFactory = app.get(TikTokConnectorFactory);
    const { connector } = await connectorFactory.forCompany(companyId);
    const order = await connector.getOrder(companyId, externalOrderId);

    console.log('----------------------------------------------------');
    console.log(`status externo: ${order.status} (mapeado internamente: ${order.internalStatus || '(desconhecido)'})`);
    console.log(`customerName mapeado (buyer_name || recipient_address.name): ${order.customerName ?? '(vazio)'}`);
    console.log('----------------------------------------------------');
    console.log('Payload bruto completo da TikTok para este pedido:');
    console.log(JSON.stringify(order.raw, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
