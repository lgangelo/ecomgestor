/* eslint-disable no-console */
/**
 * Lista todos os pedidos de um canal num mês (por orderDate), para comparar contra a contagem
 * feita direto no painel da TikTok — usado quando as duas contagens não batem (ex.: 35 aqui vs
 * 34 lá) e é preciso achar a diferença na mão. `externalOrderId` é UNIQUE por (companyId,
 * channelId) no banco (restrição do schema), então duplicata exata por número de pedido é
 * estruturalmente impossível aqui — mas lista tudo pra comparação visual e também sinaliza
 * pedidos CANCELLED (que a contagem da TikTok pode não incluir) e pedidos sem NF-e.
 *
 * Uso:
 *   npm run list-orders-for-month -- 2026-08
 */
import { PrismaClient } from '@ecommerce-manager/database';

const prisma = new PrismaClient();

async function main() {
  const month = process.argv[2];
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    console.error('Uso: npm run list-orders-for-month -- AAAA-MM (ex.: 2026-08)');
    process.exitCode = 1;
    return;
  }

  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);

  const orders = await prisma.order.findMany({
    where: { orderDate: { gte: start, lt: end }, channel: { type: 'TIKTOK_SHOP' } },
    include: { fiscalDocuments: { select: { id: true, status: true } } },
    orderBy: { orderDate: 'asc' },
  });

  console.log(`Total de pedidos TikTok Shop em ${month}: ${orders.length}`);

  const byStatus = new Map<string, number>();
  for (const o of orders) byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1);
  console.log('Por status:', Object.fromEntries(byStatus));

  const withoutFiscal = orders.filter((o) => o.fiscalDocuments.length === 0);
  console.log(`Sem documento fiscal: ${withoutFiscal.length}`);

  const cancelled = orders.filter((o) => o.status === 'CANCELLED');
  console.log(`Cancelados (a TikTok pode não contar esses): ${cancelled.length}`);

  // Duplicata exata por externalOrderId é impossível (UNIQUE no schema) — mas confirma mesmo
  // assim, e sinaliza qualquer pedido sem externalOrderId (venda manual teria vindo por engano
  // com data de agosto, por exemplo).
  const seen = new Map<string, number>();
  for (const o of orders) {
    const key = o.externalOrderId ?? `SEM_ID:${o.id}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const duplicated = [...seen.entries()].filter(([, count]) => count > 1);
  console.log(`Números de pedido duplicados: ${duplicated.length}`);
  for (const [key, count] of duplicated) console.log(`  ${key}: ${count}x`);

  console.log('----------------------------------------------------');
  console.log('Lista completa (data, número do pedido, status, valor, NF-e):');
  for (const o of orders) {
    console.log(
      `  ${o.orderDate.toISOString().slice(0, 10)}  ${o.externalOrderId ?? '(sem id externo)'}  ${o.status}  R$${o.total}  NF-e:${o.fiscalDocuments.length > 0 ? o.fiscalDocuments.map((f) => f.status).join(',') : 'nenhuma'}`,
    );
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
