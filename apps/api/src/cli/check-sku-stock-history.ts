/* eslint-disable no-console */
/**
 * Dump do histórico de movimentação de estoque (InventoryMovement) + saldo atual das variações
 * usadas em um ou mais PEDIDOS (por externalOrderId) — usado para investigar por que pedidos com
 * reserva antiga falharam com "estoque físico negativo" ao tentar debitar na hora do envio,
 * mesmo depois da correção do sync de estoque (onHand vs available). Recebe o número do pedido
 * (não o SKU) porque `skuAtSale` é uma FOTO do momento da venda — se o SKU base do produto foi
 * renomeado depois (renumera as variações automaticamente), o SKU antigo não existe mais e uma
 * busca por SKU não acha nada. Mostra a sequência real de eventos, em vez de adivinhar.
 *
 * Uso:
 *   npm run check-sku-stock-history -- 585794366323459351 585794478920270934
 */
import { PrismaClient } from '@ecommerce-manager/database';

const prisma = new PrismaClient();

async function main() {
  const externalOrderIds = process.argv.slice(2);
  if (externalOrderIds.length === 0) {
    console.error('Uso: npm run check-sku-stock-history -- <externalOrderId1> <externalOrderId2> ...');
    process.exitCode = 1;
    return;
  }

  const seenVariantIds = new Set<string>();

  for (const externalOrderId of externalOrderIds) {
    console.log('======================================================');
    const order = await prisma.order.findFirst({
      where: { externalOrderId },
      include: { items: { include: { variant: { include: { inventory: true, product: { select: { name: true } } } } } } },
    });
    if (!order) {
      console.log(`Pedido ${externalOrderId}: não encontrado.`);
      continue;
    }

    console.log(`Pedido ${externalOrderId} — status=${order.status}, id=${order.id}`);
    for (const item of order.items) {
      if (!item.variant) {
        console.log(`  item "${item.productNameAtSale}" — sem variantId (não vinculado).`);
        continue;
      }
      const v = item.variant;
      console.log(
        `  item "${item.productNameAtSale}" — SKU atual=${v.sku} (SKU na venda="${item.skuAtSale}") variantId=${v.id} qty=${item.quantity}`,
      );
      seenVariantIds.add(v.id);
    }
  }

  for (const variantId of seenVariantIds) {
    console.log('------------------------------------------------------');
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { inventory: true, product: { select: { name: true } } },
    });
    if (!variant) continue;

    console.log(`Variante ${variant.sku} (${variant.product.name}) — variantId=${variant.id}`);
    console.log(
      `  Saldo atual: onHand=${variant.inventory?.onHand ?? 0}, reserved=${variant.inventory?.reserved ?? 0}, available=${(variant.inventory?.onHand ?? 0) - (variant.inventory?.reserved ?? 0)}`,
    );

    const movements = await prisma.inventoryMovement.findMany({
      where: { variantId },
      orderBy: { createdAt: 'asc' },
      select: {
        createdAt: true,
        type: true,
        quantity: true,
        previousOnHand: true,
        newOnHand: true,
        previousReserved: true,
        newReserved: true,
        referenceType: true,
        referenceId: true,
        reason: true,
      },
    });

    console.log(`  ${movements.length} movimentação(ões):`);
    for (const m of movements) {
      console.log(
        `    [${m.createdAt.toISOString()}] ${m.type} qty=${m.quantity} onHand ${m.previousOnHand}->${m.newOnHand} reserved ${m.previousReserved}->${m.newReserved} ref=${m.referenceType}:${m.referenceId} motivo="${m.reason ?? ''}"`,
      );
    }
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
