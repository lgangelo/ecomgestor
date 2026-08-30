/* eslint-disable no-console */
/**
 * Diagnóstico do pedido 584612868964910745 (e qualquer outro "SKU sem vínculo" que não resolve
 * nem depois de ressincronizar + reprocessar): verifica se o SKU ainda existe no catálogo ATUAL
 * da TikTok (via listUnmatched, que busca o catálogo inteiro) ou se some de lá — nesse caso
 * "Vincular"/"Criar" nunca vão aparecer para ele na aba Produtos, porque essa tela só lista o que
 * a TikTok realmente devolve agora.
 *
 * Uso:
 *   npm run check-unmatched-sku -- 1736083605037942084
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { TikTokProductsSyncService } from '../integrations/tiktok/tiktok-products-sync.service';

async function main() {
  const externalSku = process.argv[2];
  if (!externalSku) {
    console.error('Uso: npm run check-unmatched-sku -- <externalSku>');
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

  const mapping = await prisma.channelProductMapping.findFirst({ where: { externalSku } });
  console.log('----------------------------------------------------');
  console.log(`channel_product_mapping para externalSku=${externalSku}:`);
  console.log(mapping ? JSON.stringify(mapping) : '  nenhum registro encontrado');
  await prisma.$disconnect();

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const productsSync = app.get(TikTokProductsSyncService);
    const unmatched = await productsSync.listUnmatched(company.id);
    const found = unmatched.find((p) => p.externalSku === externalSku);

    console.log('----------------------------------------------------');
    console.log(`Total de produtos não vinculados retornados pela TikTok agora: ${unmatched.length}`);
    if (found) {
      console.log(`SKU ${externalSku} APARECE no catálogo atual da TikTok — deveria estar disponível para "Vincular"/"Criar" na aba Produtos:`);
      console.log(JSON.stringify(found));
    } else {
      console.log(`SKU ${externalSku} NÃO aparece no catálogo atual da TikTok (Search Products não devolveu esse SKU).`);
      console.log('Isso indica que o produto foi excluído/desativado do lado da TikTok — a aba Produtos nunca vai oferecer "Vincular"/"Criar" para ele, porque só lista o que a TikTok devolve agora.');
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro no diagnóstico:', err.message ?? err);
  process.exitCode = 1;
});
