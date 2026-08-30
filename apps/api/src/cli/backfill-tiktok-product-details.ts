/* eslint-disable no-console */
/**
 * Backfill único de imagem + cor/tamanho para produtos TikTok já vinculados antes desses campos
 * existirem/serem extraídos corretamente. `syncLinkedProducts` já faz isso automaticamente a
 * cada sincronização, mas limita a 20 chamadas de "Get Product" por execução (para não travar o
 * job de rotina num catálogo grande) — esse limite baixo faz o job de rotina ficar sempre preso
 * nos mesmos produtos sem nunca alcançar o resto do catálogo quando muitos produtos não têm um
 * dos atributos (ex.: só "Cor", nunca "Tamanho" — a condição de "falta algo" nunca se resolve
 * para eles). Este script chama `syncLinkedProducts` uma única vez sem limite prático, cobrindo
 * o catálogo inteiro de uma só vez.
 *
 * Uso:
 *   npm run backfill-tiktok-product-details
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { TikTokProductsSyncService } from '../integrations/tiktok/tiktok-products-sync.service';

const UNLIMITED = 1_000_000;

async function main() {
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
    const productsSync = app.get(TikTokProductsSyncService);
    const result = await productsSync.syncLinkedProducts(company.id, null, UNLIMITED);

    console.log('----------------------------------------------------');
    console.log(`Atualizados: ${result.updated}`);
    console.log(`Inalterados: ${result.unchanged}`);
    console.log(`Não encontrados na TikTok: ${result.notFoundOnTikTok}`);
    console.log(`Falhas: ${result.failed.length}`);
    for (const f of result.failed) console.log(`  falha em ${f.externalSku}: ${f.error}`);
    console.log('----------------------------------------------------');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro no backfill:', err.message ?? err);
  process.exitCode = 1;
});
