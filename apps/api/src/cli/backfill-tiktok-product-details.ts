/* eslint-disable no-console */
/**
 * Backfill único de imagem + cor/tamanho para produtos TikTok já vinculados antes desses campos
 * existirem/serem extraídos corretamente. `syncLinkedProducts` já faz isso automaticamente a
 * cada sincronização, mas limita a 20 chamadas de "Get Product" por execução (para não travar o
 * job de rotina num catálogo grande) — este script chama em loop até não haver mais nada para
 * atualizar, sem precisar clicar "Sincronizar agora" repetidamente na tela.
 *
 * Uso:
 *   npm run backfill-tiktok-product-details
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { TikTokProductsSyncService } from '../integrations/tiktok/tiktok-products-sync.service';

const MAX_ROUNDS = 50;

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

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const result = await productsSync.syncLinkedProducts(company.id, null);
      console.log(
        `Rodada ${round}: atualizados=${result.updated} inalterados=${result.unchanged} falhas=${result.failed.length}`,
      );
      if (result.failed.length > 0) {
        for (const f of result.failed) console.log(`  falha em ${f.externalSku}: ${f.error}`);
      }
      if (result.updated === 0) {
        console.log('Nada mais para atualizar — encerrando.');
        break;
      }
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro no backfill:', err.message ?? err);
  process.exitCode = 1;
});
