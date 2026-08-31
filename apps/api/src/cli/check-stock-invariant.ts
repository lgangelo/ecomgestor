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

  // Confirmado (check-sku-stock-history): vários pedidos SHIPPED reais tinham variação com
  // físico=0 e ZERO movimentações desde sempre — não é corrupção, é estoque que nunca foi
  // carregado de verdade nessas variações. Mede o tamanho real do problema: quantas variações
  // estão "nunca inicializadas" E têm venda de verdade (não é só um produto cadastrado sem
  // nunca ter vendido, que legitimamente pode estar zerado).
  console.log('======================================================');
  const zeroStock = inventories.filter((inv) => inv.onHand === 0 && inv.reserved === 0);
  const movementCounts = await prisma.inventoryMovement.groupBy({
    by: ['variantId'],
    where: { variantId: { in: zeroStock.map((inv) => inv.variantId) } },
    _count: { _all: true },
  });
  const variantIdsWithMovements = new Set(movementCounts.map((m) => m.variantId));
  const neverInitialized = zeroStock.filter((inv) => !variantIdsWithMovements.has(inv.variantId));

  const orderItemCounts = await prisma.orderItem.groupBy({
    by: ['variantId'],
    where: {
      variantId: { in: neverInitialized.map((inv) => inv.variantId) },
      order: { status: { not: 'CANCELLED' } },
    },
    _count: { _all: true },
  });
  const soldCountByVariant = new Map(orderItemCounts.map((o) => [o.variantId, o._count._all]));
  const neverInitializedButSold = neverInitialized.filter((inv) => (soldCountByVariant.get(inv.variantId) ?? 0) > 0);

  console.log(`Variações com físico=0 e nunca tiveram NENHUMA movimentação de estoque: ${neverInitialized.length}`);
  console.log(`  ...das quais já têm pedido de venda de verdade (precisam de carga de estoque real): ${neverInitializedButSold.length}`);
  console.log('----------------------------------------------------');
  for (const inv of neverInitializedButSold) {
    console.log(
      `SKU ${inv.variant.sku} (${inv.variant.product.name}) — ${soldCountByVariant.get(inv.variantId)} item(ns) de pedido não cancelado, físico=0, nunca inicializado.`,
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
