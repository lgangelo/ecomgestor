/* eslint-disable no-console */
/**
 * Migração de DADO (não de schema — `Integration.autoInventorySyncEnabled` já existe desde a
 * Fase 4, só nunca tinha sido ligado a nada em código): copia o valor atual de
 * `Company.inventoryAutoSyncEnabled` (chave única, pra empresa inteira) pra dentro de
 * `Integration.autoInventorySyncEnabled` de cada integração TikTok Shop existente.
 *
 * Necessário ANTES de `TikTokStockOutboxService.processPending` passar a ler o campo por
 * integração em vez do campo por empresa — sem isso, quem já tinha o auto-sync ligado em
 * produção perderia o envio automático de estoque da noite pro dia.
 *
 * Só leitura + um único UPDATE por integração TikTok — idempotente (rodar de novo não muda nada
 * que já foi copiado corretamente).
 *
 * Uso:
 *   npm run backfill-integration-auto-sync-flag --workspace=@ecommerce-manager/api
 */
import { IntegrationProvider, PrismaClient } from '@ecommerce-manager/database';

const prisma = new PrismaClient();

async function main() {
  const integrations = await prisma.integration.findMany({
    where: { provider: IntegrationProvider.TIKTOK_SHOP },
    include: { company: { select: { inventoryAutoSyncEnabled: true, name: true } } },
  });

  console.log(`Integrações TikTok Shop encontradas: ${integrations.length}`);

  for (const integration of integrations) {
    const from = integration.autoInventorySyncEnabled;
    const to = integration.company.inventoryAutoSyncEnabled;
    if (from === to) {
      console.log(`  ${integration.company.name} (integrationId=${integration.id}): já está ${to} — nada a fazer.`);
      continue;
    }
    await prisma.integration.update({
      where: { id: integration.id },
      data: { autoInventorySyncEnabled: to },
    });
    console.log(`  ${integration.company.name} (integrationId=${integration.id}): ${from} -> ${to}`);
  }
}

main()
  .catch((err) => {
    console.error('Erro:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
