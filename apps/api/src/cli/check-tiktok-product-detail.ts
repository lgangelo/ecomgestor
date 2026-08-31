/* eslint-disable no-console */
/**
 * Chama "Get Product" (detalhe completo, todas as SKUs) direto na TikTok para um
 * externalProductId — ao contrário de "Search Products" (usada para achar itens "não
 * vinculados"), este endpoint não parece excluir SKUs sem estoque/inativas. Usado para
 * descobrir se um externalSku específico é uma variação de um produto já conhecido (que
 * "Search Products" simplesmente não estava trazendo) antes de criar um produto novo à toa.
 *
 * Uso:
 *   npm run check-tiktok-product-detail -- 1736083838003807556
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { TikTokConnectorFactory } from '../integrations/tiktok/tiktok-connector.factory';

async function main() {
  const externalProductId = process.argv[2];
  if (!externalProductId) {
    console.error('Uso: npm run check-tiktok-product-detail -- <externalProductId>');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  const company = await prisma.company.findFirst();
  await prisma.$disconnect();
  if (!company) {
    console.error('Nenhuma empresa encontrada.');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const connectorFactory = app.get(TikTokConnectorFactory);
    const { connector } = await connectorFactory.forCompany(company.id);
    const detail = await connector.getProductDetail(company.id, externalProductId);

    console.log(`Produto ${externalProductId} — imageUrl=${detail.imageUrl ?? '—'}`);
    console.log(`Total de SKUs retornadas pela TikTok: ${detail.skus.length}`);
    for (const sku of detail.skus) {
      console.log(`  externalSku=${sku.externalSku} color=${sku.color ?? '—'} size=${sku.size ?? '—'}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
