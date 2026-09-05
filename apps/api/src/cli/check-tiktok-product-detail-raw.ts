/* eslint-disable no-console */
/**
 * Imprime o payload BRUTO de "Get Product" (sem passar pelo mapper) pra um externalProductId —
 * especificamente pra ver o formato EXATO de `sku_img` dentro de `sales_attributes` (a
 * existência do campo já foi confirmada em produção, mas o formato interno dele — string direta?
 * objeto com `urls`/`thumb_urls`? outra coisa? — nunca foi inspecionado byte a byte, só tratado
 * defensivamente em `extractSkuImageUrl`). Usar o resultado pra corrigir a extração com certeza,
 * em vez de continuar iterando às cegas via backfill.
 *
 * Uso:
 *   npm run check-tiktok-product-detail-raw --workspace=@ecommerce-manager/api -- <externalProductId>
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { TikTokConnectorFactory } from '../integrations/tiktok/tiktok-connector.factory';

async function main() {
  const externalProductId = process.argv[2];
  if (!externalProductId) {
    console.error('Uso: npm run check-tiktok-product-detail-raw --workspace=@ecommerce-manager/api -- <externalProductId>');
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
    const raw = (await connector.getProductDetailRaw(company.id, externalProductId)) as Record<string, unknown>;

    const skus = Array.isArray(raw.skus) ? (raw.skus as Record<string, unknown>[]) : [];
    console.log(`Total de SKUs: ${skus.length}`);
    console.log('----------------------------------------------------');
    for (const sku of skus) {
      console.log(`SKU id=${sku.id}`);
      console.log(JSON.stringify(sku.sales_attributes, null, 2));
      console.log('----------------------------------------------------');
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
