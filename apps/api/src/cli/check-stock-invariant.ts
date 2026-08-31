/* eslint-disable no-console */
/**
 * Lista toda variação cujo saldo está com o invariante quebrado (reservado > físico) — situação
 * que nunca deveria existir (bloqueada pelo ledger em toda operação normal), mas que pode ter
 * ficado assim por causa do bug já corrigido em `syncLinkedProducts` (comparava o estoque
 * reportado pela TikTok contra o físico total em vez do disponível, drenando o físico abaixo do
 * que já estava reservado). Essas variações têm pedidos que nunca vão conseguir avançar de
 * status (a baixa física falha com "estoque físico negativo") até o saldo ser corrigido
 * manualmente (ex.: um ajuste de estoque que reflita a contagem física real).
 *
 * Uso:
 *   npm run check-stock-invariant
 */
import { PrismaClient } from '@ecommerce-manager/database';

const prisma = new PrismaClient();

async function main() {
  const inventories = await prisma.inventory.findMany({
    include: { variant: { select: { sku: true, product: { select: { name: true } } } } },
  });

  const broken = inventories.filter((inv) => inv.reserved > inv.onHand);

  console.log(`Total de variações com estoque cadastrado: ${inventories.length}`);
  console.log(`Variações com reservado > físico (invariante quebrado): ${broken.length}`);
  console.log('----------------------------------------------------');
  for (const inv of broken) {
    console.log(
      `SKU ${inv.variant.sku} (${inv.variant.product.name}) — físico=${inv.onHand}, reservado=${inv.reserved}, faltam ${inv.reserved - inv.onHand} unidade(s) para o saldo fechar.`,
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
