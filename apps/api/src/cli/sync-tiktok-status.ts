/* eslint-disable no-console */
/**
 * Roda manualmente `TikTokProductsPublishService.syncStatus` — pedido do usuário: produto que
 * fica INACTIVE na nossa plataforma precisa ficar desativado na TikTok Shop também (e reativado
 * se voltar a ficar ACTIVE). Chama `Deactivate Products`/`Activate Product` DE VERDADE pros
 * produtos cujo status mudou desde a última sincronização — não é dry-run.
 *
 * Roda automaticamente a cada 5 min (mesmo ciclo de `publishEligible`, ver
 * `TikTokProductsPublishSchedulerService`) quando `TIKTOK_PRODUCTS_SYNC_ENABLED=true`. Este script
 * serve pra testar manualmente antes de confiar no ciclo automático.
 *
 * Uso:
 *   npm run sync-tiktok-status --workspace=@ecommerce-manager/api --
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { TikTokProductsPublishService } from '../integrations/tiktok/tiktok-products-publish.service';

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
    const productsPublish = app.get(TikTokProductsPublishService);
    const result = await productsPublish.syncStatus(company.id);
    console.log('Resultado:', JSON.stringify(result, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
