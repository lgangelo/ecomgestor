/* eslint-disable no-console */
/**
 * DRY-RUN — monta (sem enviar) o payload de "Enviar Dados Fiscais" (`POST /items/fiscal_information`)
 * pra UMA variação já publicada no Mercado Livre, pra revisar antes de confiar no envio real ou
 * no ciclo automático (`syncPublished`). Nunca chama a API de verdade.
 *
 * Uso (aceita o SKU — o código que já aparece no cadastro do produto):
 *   npm run check-mercadolivre-fiscal-information --workspace=@ecommerce-manager/api -- <SKU>
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { MercadoLivreProductsSyncService } from '../integrations/mercadolivre/mercadolivre-products-sync.service';

async function main() {
  const sku = process.argv[2];
  if (!sku) {
    console.error('Uso: npm run check-mercadolivre-fiscal-information --workspace=@ecommerce-manager/api -- <SKU>');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  const company = await prisma.company.findFirst();
  const dbVariant = await prisma.productVariant.findFirst({ where: { sku, product: { companyId: company?.id } } });
  await prisma.$disconnect();
  if (!company) {
    console.error('Nenhuma empresa encontrada.');
    process.exitCode = 1;
    return;
  }
  if (!dbVariant) {
    console.error(`Nenhuma variação encontrada com o SKU "${sku}".`);
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const productsSync = app.get(MercadoLivreProductsSyncService);
    const payload = await productsSync.previewFiscalInformation(company.id, dbVariant.id);
    if (!payload) {
      console.log(
        'Nada a enviar — categoria sem CategoryFiscalProfile configurado pro Mercado Livre, ou variação sem custo cadastrado.',
      );
      return;
    }
    console.log('Payload que SERIA enviado pra "Enviar Dados Fiscais" (nada foi enviado de verdade):');
    console.log(JSON.stringify(payload, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
