/* eslint-disable no-console */
/**
 * Lista variações vinculadas à TikTok que têm cor definida mas AINDA sem foto própria
 * (`imageUrl` nulo) — usado pra achar um `externalProductId` real pra rodar
 * `check-tiktok-product-detail-raw` em cima, em vez de adivinhar um id que pode já não existir
 * mais do lado da TikTok.
 *
 * Uso:
 *   npm run check-tiktok-missing-variant-photos --workspace=@ecommerce-manager/api
 */
import { PrismaClient } from '@ecommerce-manager/database';

const LIMIT = 15;

async function main() {
  const prisma = new PrismaClient();
  try {
    const company = await prisma.company.findFirst();
    if (!company) {
      console.error('Nenhuma empresa encontrada.');
      process.exitCode = 1;
      return;
    }

    const variants = await prisma.productVariant.findMany({
      where: { color: { not: null }, imageUrl: null, product: { companyId: company.id } },
      include: { product: { select: { name: true } }, channelMappings: { select: { externalProductId: true, externalSku: true } } },
      take: LIMIT,
    });

    if (variants.length === 0) {
      console.log('Nenhuma variação com cor sem foto encontrada — o backfill parece ter coberto tudo.');
      return;
    }

    console.log(`Variações com cor mas sem foto própria (mostrando até ${LIMIT}):`);
    console.log('----------------------------------------------------');
    for (const v of variants) {
      const mapping = v.channelMappings[0];
      console.log(
        `${v.product.name} — SKU ${v.sku} (cor: ${v.color}) — externalProductId=${mapping?.externalProductId ?? '—'} externalSku=${mapping?.externalSku ?? '—'}`,
      );
    }
    console.log('----------------------------------------------------');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
