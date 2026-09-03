/* eslint-disable no-console */
/**
 * Corrige o `status` dos `Settlement` já gravados (todos ficaram como PENDING, o fallback padrão,
 * porque `normalizeStatement` lia um campo `status` que não existe no payload real da TikTok —
 * o campo certo é `payment_status`, confirmado via `check-settlements` CLI. Isso inflava o card
 * "A receber" do dashboard com extratos que na verdade já foram pagos).
 *
 * Zera o checkpoint `financeSyncAt` (faz `syncStatements` reprocessar tudo, sem o corte de 7 dias
 * que existe só pra não rebuscar o histórico inteiro toda hora) e roda a sincronização financeira
 * uma vez, com o mapeamento já corrigido — mesmo caminho de código de produção, sem lógica
 * duplicada. Só grava de novo quando algo muda de verdade (upsert por externalStatementId).
 *
 * Uso:
 *   npm run backfill-settlement-status
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { TikTokFinanceSyncService } from '../integrations/tiktok/tiktok-finance-sync.service';

async function main() {
  const prisma = new PrismaClient();

  const integration = await prisma.integration.findFirst({ where: { provider: 'TIKTOK_SHOP' } });
  if (!integration) {
    console.log('Nenhuma integração TikTok encontrada.');
    await prisma.$disconnect();
    return;
  }
  const companyId = integration.companyId;

  const before = await prisma.settlement.groupBy({ by: ['status'], _count: { _all: true }, _sum: { totalAmount: true } });
  console.log('ANTES:');
  for (const g of before) console.log(`  ${g.status}: ${g._count._all} — soma R$ ${Number(g._sum.totalAmount ?? 0).toFixed(2)}`);

  const checkpoints = (integration.syncCheckpoints as Record<string, unknown> | null) ?? {};
  await prisma.integration.update({
    where: { id: integration.id },
    data: { syncCheckpoints: { ...checkpoints, financeSyncAt: null } },
  });
  await prisma.$disconnect();

  console.log('----------------------------------------------------');
  console.log('Rodando syncStatements (checkpoint zerado, reprocessa todos os extratos)...');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const financeSync = app.get(TikTokFinanceSyncService);
    const result = await financeSync.syncStatements(companyId);
    console.log(`statementsSynced=${result.statementsSynced} transactionsSynced=${result.transactionsSynced}`);
  } finally {
    await app.close();
  }

  const prisma2 = new PrismaClient();
  const after = await prisma2.settlement.groupBy({ by: ['status'], _count: { _all: true }, _sum: { totalAmount: true } });
  console.log('----------------------------------------------------');
  console.log('DEPOIS:');
  for (const g of after) console.log(`  ${g.status}: ${g._count._all} — soma R$ ${Number(g._sum.totalAmount ?? 0).toFixed(2)}`);
  await prisma2.$disconnect();
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
