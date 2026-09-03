/* eslint-disable no-console */
/**
 * Diagnóstico do card "A receber" (Settlement.totalAmount, status != PAID): mostra a distribuição
 * real de status/valor gravados no banco, e busca os extratos mais recentes DIRETO na TikTok para
 * comparar o `status` bruto retornado por ela contra o que `mapSettlementStatus` (heurística por
 * substring, nunca confirmada contra o payload real) classificou. Sem isso, não dá para saber se
 * "SETTLED" pra TikTok já significa "dinheiro caiu na conta" (e deveria contar como PAID) ou é só
 * uma etapa intermediária antes do repasse de fato.
 *
 * Uso:
 *   npm run check-settlements
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { TikTokConnectorFactory } from '../integrations/tiktok/tiktok-connector.factory';
import { TikTokCredentialsService } from '../integrations/tiktok/tiktok-credentials.service';

async function main() {
  const prisma = new PrismaClient();

  console.log('Distribuição de Settlement por status (banco local):');
  const grouped = await prisma.settlement.groupBy({
    by: ['status'],
    _count: { _all: true },
    _sum: { totalAmount: true },
  });
  for (const g of grouped) {
    console.log(`  ${g.status}: ${g._count._all} extrato(s) — soma R$ ${Number(g._sum.totalAmount ?? 0).toFixed(2)}`);
  }

  const integration = await prisma.integration.findFirst({ where: { provider: 'TIKTOK_SHOP' } });
  if (!integration) {
    console.log('Nenhuma integração TikTok encontrada — não é possível buscar os extratos brutos.');
    await prisma.$disconnect();
    return;
  }
  const companyId = integration.companyId;
  await prisma.$disconnect();

  console.log('----------------------------------------------------');
  console.log('Buscando os extratos mais recentes direto na TikTok (Get Statements)...');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const credentialsService = app.get(TikTokCredentialsService);
    const connectorFactory = app.get(TikTokConnectorFactory);
    await credentialsService.requireIntegration(companyId);
    const { connector } = await connectorFactory.forCompany(companyId);

    const page = await connector.getStatements(companyId, { pageSize: 20 });
    console.log(`Recebidos ${page.items.length} extrato(s) (mais recentes primeiro):`);
    for (const stmt of page.items) {
      console.log(
        `  id=${stmt.externalStatementId} período=${stmt.periodStart.toISOString().slice(0, 10)}..${stmt.periodEnd
          .toISOString()
          .slice(0, 10)} valor=R$ ${stmt.totalAmount} status_bruto_tiktok="${stmt.status}"`,
      );
    }
    console.log('----------------------------------------------------');
    console.log('Payload bruto COMPLETO do extrato mais recente (pra achar o nome real do campo de status):');
    console.log(JSON.stringify((page.items[0] as unknown as { raw?: unknown })?.raw ?? null, null, 2));

    console.log('----------------------------------------------------');
    console.log(
      '"Get Unsettled Transactions" (/finance/.../transactions/unsettled) NÃO existe — confirmado ' +
        '"Invalid path" contra a API real. Tentando "Get Payments" em vez disso (lista de lotes de ' +
        'repasse, cada um com status — path confirmado contra um SDK open-source real):',
    );
    try {
      const payments = await connector.getPaymentsRaw(companyId);
      console.log(JSON.stringify(payments, null, 2));
    } catch (err) {
      console.log(`Falhou (path/parâmetro ainda não confirmado): ${(err as Error).message}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
