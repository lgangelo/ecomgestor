/* eslint-disable no-console */
/**
 * Lista as entradas `FAILED` do outbox de estoque (qualquer canal) com o erro real salvo —
 * a tela de Estoque de cada integração só mostra o badge "Erro", nunca a mensagem (lacuna real
 * encontrada em produção). Só leitura.
 *
 * Uso:
 *   npm run check-stock-outbox-errors --workspace=@ecommerce-manager/api
 */
import { PrismaClient } from '@ecommerce-manager/database';

const prisma = new PrismaClient();

async function main() {
  const entries = await prisma.stockSyncOutboxEntry.findMany({
    where: { status: 'FAILED' },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: { variant: { select: { sku: true } }, channel: { select: { name: true, type: true } } },
  });

  if (entries.length === 0) {
    console.log('Nenhuma entrada FAILED no outbox de estoque.');
    return;
  }

  for (const e of entries) {
    console.log('======================================================');
    console.log(`Canal: ${e.channel.name} (${e.channel.type}) | SKU: ${e.variant.sku} | alvo: ${e.targetAvailable}`);
    console.log(`Tentativas: ${e.attempts} | Criado: ${e.createdAt.toISOString()} | Processado: ${e.processedAt?.toISOString() ?? '—'}`);
    console.log(`Erro: ${e.lastError ?? '—'}`);
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
