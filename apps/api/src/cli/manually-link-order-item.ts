/* eslint-disable no-console */
/**
 * Resolve manualmente um item de pedido sem vínculo para uma variação escolhida à mão, SEM
 * tocar em `channel_product_mapping` — usado quando o SKU externo do pedido é antigo/substituído
 * (a TikTok recriou o produto com um ID novo, mas a variação já está corretamente vinculada ao
 * SKU ATUAL pra sincronizações futuras) e o vínculo normal ("Vincular") nunca vai servir porque
 * bateria na restrição única de (canal, variação).
 *
 * Uso:
 *   npm run manually-link-order-item -- <externalOrderId> <skuInterno>
 *   npm run manually-link-order-item -- 584612868964910745 R309
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { OrdersService } from '../orders/orders.service';

async function main() {
  const [externalOrderId, internalSku] = process.argv.slice(2);
  if (!externalOrderId || !internalSku) {
    console.error('Uso: npm run manually-link-order-item -- <externalOrderId> <skuInterno>');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  const order = await prisma.order.findFirst({
    where: { externalOrderId },
    include: { items: true },
  });
  if (!order) {
    console.error(`Pedido ${externalOrderId} não encontrado.`);
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  const pendingItems = order.items.filter((i) => !i.variantId);
  if (pendingItems.length === 0) {
    console.log('Este pedido não tem nenhum item sem vínculo — nada a fazer.');
    await prisma.$disconnect();
    return;
  }
  if (pendingItems.length > 1) {
    console.error(`Pedido tem ${pendingItems.length} itens sem vínculo — este script só resolve um por vez. Itens:`);
    for (const i of pendingItems) console.error(`  itemId=${i.id} nome="${i.productNameAtSale}" externalSku=${i.externalSku}`);
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }
  const item = pendingItems[0];

  const variant = await prisma.productVariant.findFirst({
    where: { sku: internalSku, product: { companyId: order.companyId } },
    include: { product: { select: { name: true } } },
  });
  if (!variant) {
    console.error(`Variação com SKU interno "${internalSku}" não encontrada.`);
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }
  console.log(`Item do pedido: "${item.productNameAtSale}" (externalSku=${item.externalSku})`);
  console.log(`Variação alvo: ${variant.product.name} (SKU ${variant.sku}, variantId=${variant.id})`);
  await prisma.$disconnect();

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const ordersService = app.get(OrdersService);
    const result = await ordersService.manuallyResolveOrderItem(
      order.id,
      order.companyId,
      'cli-script',
      item.id,
      variant.id,
    );
    console.log(`Resolvido: ${result.resolved}`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
