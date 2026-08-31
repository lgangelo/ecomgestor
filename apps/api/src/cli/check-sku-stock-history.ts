/* eslint-disable no-console */
/**
 * Dump do histórico de movimentação de estoque (InventoryMovement) + saldo atual de uma ou mais
 * SKUs — usado para investigar por que pedidos com reserva antiga (ex.: "SKU sem vínculo" ou
 * "aguardando envio" há dias) falharam com "estoque físico negativo" ao tentar debitar na hora
 * do envio, mesmo depois da correção do sync de estoque (onHand vs available). Mostra a
 * sequência real de eventos que levou o saldo físico a ficar abaixo do reservado, em vez de
 * adivinhar.
 *
 * Uso:
 *   npm run check-sku-stock-history -- 0244 0206 0207 0097
 */
import { PrismaClient } from '@ecommerce-manager/database';

const prisma = new PrismaClient();

async function main() {
  const skus = process.argv.slice(2);
  if (skus.length === 0) {
    console.error('Uso: npm run check-sku-stock-history -- <sku1> <sku2> ...');
    process.exitCode = 1;
    return;
  }

  for (const sku of skus) {
    console.log('======================================================');
    const variant = await prisma.productVariant.findFirst({
      where: { sku },
      include: { inventory: true, product: { select: { name: true } } },
    });
    if (!variant) {
      console.log(`SKU ${sku}: variante não encontrada.`);
      continue;
    }

    console.log(`SKU ${sku} (${variant.product.name}) — variantId=${variant.id}`);
    console.log(
      `  Saldo atual: onHand=${variant.inventory?.onHand ?? 0}, reserved=${variant.inventory?.reserved ?? 0}, available=${(variant.inventory?.onHand ?? 0) - (variant.inventory?.reserved ?? 0)}`,
    );

    const movements = await prisma.inventoryMovement.findMany({
      where: { variantId: variant.id },
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
