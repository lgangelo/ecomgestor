/* eslint-disable no-console */
/**
 * Diagnóstico direto: consulta `marketplace_fees` via Prisma puro, sem passar pela tela
 * Financeiro > Taxas nem pela API — se a tabela realmente estiver vazia, o problema é na
 * GRAVAÇÃO (mesmo com o log de debug indicando `willWriteFee: true`); se tiver linhas aqui mas
 * a tela não mostrar nada, o problema é na LEITURA (query de `listFees` ou filtro da tela).
 *
 * Uso:
 *   npm run check-marketplace-fees
 */
import { PrismaClient } from '@ecommerce-manager/database';

const prisma = new PrismaClient();

async function main() {
  const total = await prisma.marketplaceFee.count();
  console.log(`Total de linhas em marketplace_fees: ${total}`);

  const sample = await prisma.marketplaceFee.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: { channel: { select: { name: true, companyId: true } } },
  });
  for (const row of sample) {
    console.log(JSON.stringify(row, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)));
  }
}

main()
  .catch((err) => {
    console.error('Erro na consulta:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
