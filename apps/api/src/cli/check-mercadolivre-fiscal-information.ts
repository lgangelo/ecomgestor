/* eslint-disable no-console */
/**
 * DRY-RUN — monta (sem enviar) o payload de "Enviar Dados Fiscais" (`POST /items/fiscal_information`)
 * pra UMA variação já publicada no Mercado Livre, pra revisar antes de confiar no envio real ou
 * no ciclo automático (`syncPublished`). Nunca chama a API de verdade.
 *
 * Uso:
 *   npm run check-mercadolivre-fiscal-information --workspace=@ecommerce-manager/api -- <variantId>
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { MercadoLivreProductsSyncService } from '../integrations/mercadolivre/mercadolivre-products-sync.service';

async function main() {
  const variantId = process.argv[2];
  if (!variantId) {
    console.error('Uso: npm run check-mercadolivre-fiscal-information --workspace=@ecommerce-manager/api -- <variantId>');
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
    const productsSync = app.get(MercadoLivreProductsSyncService);
    const payload = await productsSync.previewFiscalInformation(company.id, variantId);
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
