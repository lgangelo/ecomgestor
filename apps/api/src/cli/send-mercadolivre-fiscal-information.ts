/* eslint-disable no-console */
/**
 * Envia DE VERDADE os dados fiscais (`POST /items/fiscal_information`) de UMA variação já
 * publicada no Mercado Livre — pedido do usuário: confirmar contra uma chamada real antes de
 * confiar no ciclo automático completo (`syncPublished`) pra todo o catálogo.
 *
 * Diferente de `check-mercadolivre-fiscal-information` (dry-run, nunca envia nada) — este AQUI
 * chama a API de verdade.
 *
 * Uso (aceita o SKU — o código que já aparece no cadastro do produto):
 *   npm run send-mercadolivre-fiscal-information --workspace=@ecommerce-manager/api -- <SKU>
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { MercadoLivreApiError } from '@ecommerce-manager/integrations';
import { AppModule } from '../app.module';
import { MercadoLivreProductsSyncService } from '../integrations/mercadolivre/mercadolivre-products-sync.service';

async function main() {
  const sku = process.argv[2];
  if (!sku) {
    console.error('Uso: npm run send-mercadolivre-fiscal-information --workspace=@ecommerce-manager/api -- <SKU>');
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
    console.log('Enviando de verdade (isso chama a API real do Mercado Livre)...');
    const payload = await productsSync.sendFiscalInformationNow(company.id, dbVariant.id);
    console.log(`Dados fiscais enviados pro SKU "${payload.sku}":`);
    console.log(JSON.stringify(payload, null, 2));
  } catch (error) {
    if (error instanceof MercadoLivreApiError) {
      console.error(`Falha (${error.category}, HTTP ${error.statusCode ?? '—'}): ${error.message}`);
      console.error('Corpo bruto da resposta:', JSON.stringify(error.rawResponse, null, 2));
    } else {
      console.error('Erro:', error instanceof Error ? error.message : error);
    }
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
