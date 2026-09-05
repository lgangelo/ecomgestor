/* eslint-disable no-console */
/**
 * Lista todas as variações de um produto (pelo nome, busca parcial) com seu vínculo TikTok
 * atual (se houver) — usado para descobrir qual variação interna (se alguma) já corresponde a um
 * externalSku específico, ou confirmar que nenhuma existe ainda e uma nova variação precisa ser
 * criada.
 *
 * Uso:
 *   npm run check-product-variants -- "Kit Bolsa Média"
 */
import { PrismaClient } from '@ecommerce-manager/database';

const prisma = new PrismaClient();

async function main() {
  const nameSearch = process.argv[2];
  if (!nameSearch) {
    console.error('Uso: npm run check-product-variants -- "<parte do nome do produto>"');
    process.exitCode = 1;
    return;
  }

  const products = await prisma.product.findMany({
    where: { name: { contains: nameSearch, mode: 'insensitive' } },
    include: { variants: { include: { inventory: true } } },
  });

  console.log(`Produtos encontrados: ${products.length}`);
  for (const product of products) {
    console.log('======================================================');
    console.log(`Produto: ${product.name} (baseSku=${product.baseSku}, productId=${product.id})`);
    console.log(`  Foto de capa (product.imageUrl): ${product.imageUrl ?? '—'}`);
    for (const variant of product.variants) {
      const mapping = await prisma.channelProductMapping.findFirst({
        where: { variantId: variant.id },
        select: { externalSku: true, externalProductId: true, syncStatus: true },
      });
      console.log(
        `  variante SKU=${variant.sku} color=${variant.color ?? '—'} size=${variant.size ?? '—'} variantId=${variant.id} onHand=${variant.inventory?.onHand ?? 0} reserved=${variant.inventory?.reserved ?? 0}` +
          ` | foto própria (variant.imageUrl): ${variant.imageUrl ?? '—'}` +
          (mapping
            ? ` | vinculado a externalSku=${mapping.externalSku} externalProductId=${mapping.externalProductId ?? '—'} (${mapping.syncStatus})`
            : ' | SEM vínculo TikTok'),
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
