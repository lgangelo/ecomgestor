/* eslint-disable no-console */
/**
 * Remove PERMANENTEMENTE a empresa de demonstração criada por `packages/database/prisma/seed.ts`
 * (CNPJ fixo `12.345.678/0001-90`, nome "Altenburg Ecommerce Demo") — nunca destinada a rodar em
 * produção; apareceu porque `npm run prisma:seed` foi rodado numa sessão anterior desta VM pra
 * corrigir um problema de Docker (ver git log), e o seed sempre cria/atualiza essa empresa e seus
 * produtos fictícios como efeito colateral.
 *
 * Trava de segurança dupla: só continua se a empresa encontrada bater EXATAMENTE no CNPJ E no
 * nome esperados — nunca apaga "a empresa mais recente" nem aceita um id passado por parâmetro,
 * de propósito (isto não é um utilitário genérico de exclusão de empresa).
 *
 * Por padrão roda em modo SIMULAÇÃO (só CONTA quantas linhas existem em cada tabela, usando a
 * mesma cláusula WHERE que o DELETE real usaria) — passe --confirm pra apagar de verdade, dentro
 * de uma única transação (qualquer erro no meio reverte tudo, nunca deixa a base pela metade).
 *
 * Ordem de exclusão verificada linha a linha contra packages/database/prisma/schema.prisma (toda
 * FK sem onDelete:Cascade precisa ser removida ANTES da tabela que ela referencia) — nunca
 * inferida, cada dependência foi conferida contra o schema real antes de entrar nesta lista.
 *
 * Uso:
 *   npm run purge-demo-company --workspace=@ecommerce-manager/api                # simulação
 *   npm run purge-demo-company --workspace=@ecommerce-manager/api -- --confirm   # executa
 */
import { Prisma, PrismaClient } from '@ecommerce-manager/database';

const EXPECTED_CNPJ = '12.345.678/0001-90';
const EXPECTED_NAME = 'Altenburg Ecommerce Demo';

const prisma = new PrismaClient();

type TxClient = Prisma.TransactionClient | PrismaClient;

// Cada passo: rótulo + a mesma cláusula WHERE usada tanto pra contar (simulação) quanto pra
// apagar de verdade (--confirm) — nunca duas queries divergentes pra mesma tabela.
// Ordem = ordem de exclusão real (dependentes antes de quem elas referenciam).
interface Step {
  label: string;
  count: (client: TxClient, companyId: string) => Promise<number>;
  del: (client: TxClient, companyId: string) => Promise<number>;
}

function step(
  label: string,
  countSql: (client: TxClient, id: string) => Promise<Array<{ count: bigint }>>,
  delSql: (client: TxClient, id: string) => Promise<number>,
): Step {
  return {
    label,
    count: async (client, id) => Number((await countSql(client, id))[0]?.count ?? 0n),
    del: delSql,
  };
}

const STEPS: Step[] = [
  step(
    'marketplace_fees',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM marketplace_fees WHERE channel_id IN (SELECT id FROM sales_channels WHERE company_id = ${id})`,
    (c, id) => c.$executeRaw`DELETE FROM marketplace_fees WHERE channel_id IN (SELECT id FROM sales_channels WHERE company_id = ${id})`,
  ),
  step(
    'settlement_transactions',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM settlement_transactions WHERE settlement_id IN (SELECT id FROM settlements WHERE company_id = ${id})`,
    (c, id) => c.$executeRaw`DELETE FROM settlement_transactions WHERE settlement_id IN (SELECT id FROM settlements WHERE company_id = ${id})`,
  ),
  step(
    'fiscal_documents',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM fiscal_documents WHERE company_id = ${id}`,
    (c, id) => c.$executeRaw`DELETE FROM fiscal_documents WHERE company_id = ${id}`,
  ),
  step(
    'returns',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM returns WHERE order_id IN (SELECT id FROM orders WHERE company_id = ${id})`,
    (c, id) => c.$executeRaw`DELETE FROM returns WHERE order_id IN (SELECT id FROM orders WHERE company_id = ${id})`,
  ),
  step(
    'orders',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM orders WHERE company_id = ${id}`,
    (c, id) => c.$executeRaw`DELETE FROM orders WHERE company_id = ${id}`,
  ),
  step(
    'settlements',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM settlements WHERE company_id = ${id}`,
    (c, id) => c.$executeRaw`DELETE FROM settlements WHERE company_id = ${id}`,
  ),
  step(
    'stock_sync_outbox',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM stock_sync_outbox WHERE company_id = ${id}`,
    (c, id) => c.$executeRaw`DELETE FROM stock_sync_outbox WHERE company_id = ${id}`,
  ),
  step(
    'channel_product_mappings',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM channel_product_mappings WHERE channel_id IN (SELECT id FROM sales_channels WHERE company_id = ${id})`,
    (c, id) => c.$executeRaw`DELETE FROM channel_product_mappings WHERE channel_id IN (SELECT id FROM sales_channels WHERE company_id = ${id})`,
  ),
  step(
    'webhook_events',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM webhook_events WHERE integration_id IN (SELECT id FROM integrations WHERE company_id = ${id})`,
    (c, id) => c.$executeRaw`DELETE FROM webhook_events WHERE integration_id IN (SELECT id FROM integrations WHERE company_id = ${id})`,
  ),
  step(
    'sync_jobs',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM sync_jobs WHERE integration_id IN (SELECT id FROM integrations WHERE company_id = ${id})`,
    (c, id) => c.$executeRaw`DELETE FROM sync_jobs WHERE integration_id IN (SELECT id FROM integrations WHERE company_id = ${id})`,
  ),
  step(
    'integrations',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM integrations WHERE company_id = ${id}`,
    (c, id) => c.$executeRaw`DELETE FROM integrations WHERE company_id = ${id}`,
  ),
  step(
    'inventory_counts',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM inventory_counts WHERE company_id = ${id}`,
    (c, id) => c.$executeRaw`DELETE FROM inventory_counts WHERE company_id = ${id}`,
  ),
  step(
    'stock_entries',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM stock_entries WHERE company_id = ${id}`,
    (c, id) => c.$executeRaw`DELETE FROM stock_entries WHERE company_id = ${id}`,
  ),
  step(
    'inventory_movements',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM inventory_movements WHERE company_id = ${id}`,
    (c, id) => c.$executeRaw`DELETE FROM inventory_movements WHERE company_id = ${id}`,
  ),
  step(
    'inventories',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM inventories WHERE company_id = ${id}`,
    (c, id) => c.$executeRaw`DELETE FROM inventories WHERE company_id = ${id}`,
  ),
  step(
    'product_variants',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM product_variants WHERE product_id IN (SELECT id FROM products WHERE company_id = ${id})`,
    (c, id) => c.$executeRaw`DELETE FROM product_variants WHERE product_id IN (SELECT id FROM products WHERE company_id = ${id})`,
  ),
  step(
    'products',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM products WHERE company_id = ${id}`,
    (c, id) => c.$executeRaw`DELETE FROM products WHERE company_id = ${id}`,
  ),
  step(
    'category_fiscal_profiles',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM category_fiscal_profiles WHERE company_id = ${id}`,
    (c, id) => c.$executeRaw`DELETE FROM category_fiscal_profiles WHERE company_id = ${id}`,
  ),
  {
    // Auto-referência (categoria pai/filha): repete até não sobrar nenhuma categoria desta
    // empresa, removendo a cada rodada só quem não é mais referenciada como pai por ninguém.
    label: 'categories',
    count: async (c, id) => {
      const rows = (await c.$queryRaw`SELECT COUNT(*)::bigint as count FROM categories WHERE company_id = ${id}`) as Array<{
        count: bigint;
      }>;
      return Number(rows[0]?.count ?? 0n);
    },
    del: async (c, id) => {
      let total = 0;
      for (let i = 0; i < 20; i++) {
        const affected = await c.$executeRaw`
          DELETE FROM categories
          WHERE company_id = ${id}
            AND id NOT IN (SELECT parent_id FROM categories WHERE parent_id IS NOT NULL)
        `;
        total += affected;
        if (affected === 0) break;
      }
      return total;
    },
  },
  step(
    'sales_channels',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM sales_channels WHERE company_id = ${id}`,
    (c, id) => c.$executeRaw`DELETE FROM sales_channels WHERE company_id = ${id}`,
  ),
  step(
    'suppliers',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM suppliers WHERE company_id = ${id}`,
    (c, id) => c.$executeRaw`DELETE FROM suppliers WHERE company_id = ${id}`,
  ),
  step(
    'expenses',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM expenses WHERE company_id = ${id}`,
    (c, id) => c.$executeRaw`DELETE FROM expenses WHERE company_id = ${id}`,
  ),
  step(
    'recurring_expense_templates',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM recurring_expense_templates WHERE company_id = ${id}`,
    (c, id) => c.$executeRaw`DELETE FROM recurring_expense_templates WHERE company_id = ${id}`,
  ),
  step(
    'expense_categories',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM expense_categories WHERE company_id = ${id}`,
    (c, id) => c.$executeRaw`DELETE FROM expense_categories WHERE company_id = ${id}`,
  ),
  step(
    'tax_configurations',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM tax_configurations WHERE company_id = ${id}`,
    (c, id) => c.$executeRaw`DELETE FROM tax_configurations WHERE company_id = ${id}`,
  ),
  step(
    'monthly_closings',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM monthly_closings WHERE company_id = ${id}`,
    (c, id) => c.$executeRaw`DELETE FROM monthly_closings WHERE company_id = ${id}`,
  ),
  step(
    'notifications',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM notifications WHERE company_id = ${id}`,
    (c, id) => c.$executeRaw`DELETE FROM notifications WHERE company_id = ${id}`,
  ),
  step(
    'audit_logs',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM audit_logs WHERE company_id = ${id}`,
    (c, id) => c.$executeRaw`DELETE FROM audit_logs WHERE company_id = ${id}`,
  ),
  step(
    'users',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM users WHERE company_id = ${id}`,
    (c, id) => c.$executeRaw`DELETE FROM users WHERE company_id = ${id}`,
  ),
  step(
    'companies',
    (c, id) => c.$queryRaw`SELECT COUNT(*)::bigint as count FROM companies WHERE id = ${id}`,
    (c, id) => c.$executeRaw`DELETE FROM companies WHERE id = ${id}`,
  ),
];

async function main() {
  const confirm = process.argv.includes('--confirm');

  const company = await prisma.company.findFirst({ where: { cnpj: EXPECTED_CNPJ, name: EXPECTED_NAME } });
  if (!company) {
    console.error(
      `Nenhuma empresa encontrada com CNPJ="${EXPECTED_CNPJ}" E nome="${EXPECTED_NAME}" ao mesmo tempo — ` +
        'nada foi feito. Este script só apaga exatamente a empresa de demonstração do seed, nunca outra.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Empresa encontrada: ${company.name} (id=${company.id}, cnpj=${company.cnpj}).`);
  console.log(
    confirm
      ? 'Modo EXECUÇÃO — apagando de verdade, dentro de uma única transação (revertida inteira em caso de erro).'
      : 'Modo SIMULAÇÃO — só contando, nada será apagado. Rode de novo com --confirm para executar.',
  );
  console.log('======================================================');

  if (!confirm) {
    for (const s of STEPS) {
      const n = await s.count(prisma, company.id);
      console.log(`  ${s.label}: ${n} linha(s) seriam removidas.`);
    }
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const s of STEPS) {
      const affected = await s.del(tx, company.id);
      console.log(`  ${s.label}: ${affected} linha(s) removida(s).`);
    }
  });

  console.log('======================================================');
  console.log('Empresa de demonstração removida com sucesso.');
}

main()
  .catch((err) => {
    console.error('Erro (nada foi alterado — a transação reverte tudo em caso de falha):', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
