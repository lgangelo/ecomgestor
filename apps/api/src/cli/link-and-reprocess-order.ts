/* eslint-disable no-console */
/**
 * Vincula um SKU externo da TikTok a uma variação interna DIRETO (sem depender da aba Produtos
 * mostrar o item como "não vinculado" — que só lista o que "Search Products" devolve agora; um
 * produto com estoque zerado ou temporariamente fora do ar pode sumir de lá mesmo existindo de
 * verdade) e, opcionalmente, reprocessa um pedido em seguida para aplicar o vínculo imediatamente.
 *
 * Uso:
 *   npm run link-and-reprocess-order -- <externalSku> <skuInterno> [externalOrderId]
 *   npm run link-and-reprocess-order -- 1736083605037942084 R309 584612868964910745
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { TikTokProductsSyncService } from '../integrations/tiktok/tiktok-products-sync.service';
import { OrdersService } from '../orders/orders.service';

async function main() {
  const [externalSku, internalSku, externalOrderId] = process.argv.slice(2);
  if (!externalSku || !internalSku) {
    console.error('Uso: npm run link-and-reprocess-order -- <externalSku> <skuInterno> [externalOrderId]');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  const company = await prisma.company.findFirst();
  if (!company) {
    console.error('Nenhuma empresa encontrada.');
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  const variant = await prisma.productVariant.findFirst({
    where: { sku: internalSku },
    include: { product: { select: { name: true, companyId: true } } },
  });
  if (!variant || variant.product.companyId !== company.id) {
    console.error(`Variação com SKU interno "${internalSku}" não encontrada.`);
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }
  console.log(`Variação encontrada: ${variant.product.name} (SKU ${variant.sku}, variantId=${variant.id})`);
  await prisma.$disconnect();

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const productsSync = app.get(TikTokProductsSyncService);
    const mapping = await productsSync.link(company.id, 'cli-script', externalSku, undefined, variant.id);
    console.log(`Vínculo criado/atualizado: externalSku=${externalSku} -> variantId=${variant.id} (mappingId=${mapping.id})`);

    if (externalOrderId) {
      const ordersService = app.get(OrdersService);
      const order = await new PrismaClient().order.findFirst({ where: { externalOrderId }, select: { id: true } });
      if (!order) {
        console.log(`Pedido ${externalOrderId} não encontrado para reprocessar.`);
        return;
      }
      const result = await ordersService.reprocessOrder(order.id, company.id, 'cli-script');
      console.log(`Reprocessamento do pedido ${externalOrderId}: ${result.resolvedItems} item(ns) resolvido(s).`);
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
