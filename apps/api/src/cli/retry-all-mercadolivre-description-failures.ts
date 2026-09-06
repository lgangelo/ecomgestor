/* eslint-disable no-console */
/**
 * Reprocessa em massa TODAS as falhas de publicação de descrição do Mercado Livre — pedido do
 * usuário: em vez de clicar "Tentar novamente" um por um na tela de Falhas, depois de confirmar
 * (via `check-product-description`) que a descrição salva no cadastro já fica limpa de HTML após
 * `stripHtmlForPlainText` — a maioria dessas falhas visíveis é só registro ANTIGO, de antes do
 * deploy da correção ou ainda não reprocessado manualmente, não um problema novo.
 *
 * Usa os dados ATUAIS do banco pra cada variante (mesma lógica de `retryDescriptionPublish`,
 * chamado individualmente pela tela de Falhas) — nunca reescreve a descrição salva no cadastro.
 *
 * Uso:
 *   npm run retry-all-mercadolivre-description-failures --workspace=@ecommerce-manager/api
 */
import { NestFactory } from '@nestjs/core';
import { IntegrationProvider, PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { MercadoLivreProductsSyncService } from '../integrations/mercadolivre/mercadolivre-products-sync.service';
import { MERCADO_LIVRE_JOBS } from '../queue/mercadolivre-queue.constants';

async function main() {
  const prisma = new PrismaClient();
  const company = await prisma.company.findFirst();
  if (!company) {
    console.error('Nenhuma empresa encontrada.');
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  const jobs = await prisma.syncJob.findMany({
    where: {
      type: MERCADO_LIVRE_JOBS.PUBLISH_PRODUCT_DESCRIPTION,
      status: 'FAILED',
      integration: { companyId: company.id, provider: IntegrationProvider.MERCADO_LIVRE },
    },
    select: { id: true, relatedExternalId: true },
  });
  await prisma.$disconnect();

  console.log(`${jobs.length} falha(s) de publicação de descrição encontrada(s).`);
  if (jobs.length === 0) return;

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const productsSync = app.get(MercadoLivreProductsSyncService);
    let ok = 0;
    let failed = 0;
    for (const job of jobs) {
      if (!job.relatedExternalId) continue;
      try {
        await productsSync.retryDescriptionPublish(company.id, job.relatedExternalId);
        ok++;
        console.log(`  OK: variante ${job.relatedExternalId}`);
      } catch (error) {
        failed++;
        console.log(`  AINDA FALHA: variante ${job.relatedExternalId} — ${(error as Error).message}`);
      }
    }
    console.log('----------------------------------------------------');
    console.log(`Resumo: ${ok} corrigido(s), ${failed} ainda com erro real (veja as mensagens acima).`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
