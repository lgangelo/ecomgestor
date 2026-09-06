/* eslint-disable no-console */
/**
 * Dry-run manual (pedido do usuário: testar contra 1 produto antes de ligar o ciclo automático
 * pra todo o catálogo) — monta o payload REAL de `createProduct` pra UM produto (faz upload de
 * verdade das imagens, resolve categoria/armazém/atributos de cor-tamanho), imprime pra revisão,
 * e PARA — nunca chama `createProduct` de fato. Produto precisa estar ACTIVE, com categoria
 * mapeada (`set-category-channel-mapping`) e pelo menos 1 variante ainda não publicada na TikTok
 * Shop.
 *
 * Sem argumento nenhum, lista produtos ACTIVE candidatos (categoria já mapeada pra TikTok Shop)
 * em vez de exigir adivinhar um ID.
 *
 * Uso:
 *   npm run check-tiktok-publish-dry-run --workspace=@ecommerce-manager/api
 *   npm run check-tiktok-publish-dry-run --workspace=@ecommerce-manager/api -- <productId>
 */
import { ChannelType, PrismaClient } from '@ecommerce-manager/database';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { TikTokProductsPublishService } from '../integrations/tiktok/tiktok-products-publish.service';

async function main() {
  const productId = process.argv[2];

  const prisma = new PrismaClient();
  const company = await prisma.company.findFirst();
  if (!company) {
    console.error('Nenhuma empresa encontrada.');
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  if (!productId) {
    const mappedCategoryIds = (
      await prisma.categoryChannelMapping.findMany({
        where: { companyId: company.id, channelType: ChannelType.TIKTOK_SHOP },
        select: { categoryId: true },
      })
    ).map((c) => c.categoryId);

    // ACHADO REAL: o catálogo tinha produtos importados da TikTok Shop ANTES desta mudança de
    // direção (produto nasce só na nossa plataforma agora) — esses já têm `ChannelProductMapping`
    // pro canal TikTok de antes, então TODAS as variantes já contam como "já publicadas" e nunca
    // são elegíveis pro dry-run. Filtra esses fora da lista, pra só mostrar produto realmente
    // testável (nunca teve nenhuma variante vinculada ao TikTok ainda).
    const channel = await prisma.salesChannel.findFirst({ where: { companyId: company.id, type: ChannelType.TIKTOK_SHOP } });
    const alreadyMappedVariantIds = channel
      ? new Set(
          (
            await prisma.channelProductMapping.findMany({
              where: { channelId: channel.id, variantId: { not: null } },
              select: { variantId: true },
            })
          ).map((m) => m.variantId),
        )
      : new Set<string | null>();

    const candidates = await prisma.product.findMany({
      where: { companyId: company.id, status: 'ACTIVE', categoryId: { in: mappedCategoryIds } },
      include: { category: { select: { name: true } }, variants: { select: { id: true, status: true } } },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });
    await prisma.$disconnect();

    console.log(`Uso: npm run check-tiktok-publish-dry-run -- <productId>\n`);
    const testable = candidates
      .map((p) => ({ ...p, eligibleCount: p.variants.filter((v) => v.status === 'ACTIVE' && !alreadyMappedVariantIds.has(v.id)).length }))
      .filter((p) => p.eligibleCount > 0)
      .slice(0, 20);

    if (testable.length === 0) {
      console.log(
        'Nenhum produto ACTIVE com categoria mapeada E ainda sem vínculo TikTok Shop encontrado — o catálogo existente provavelmente já veio da importação antiga. Cadastre um produto de teste novo pra testar o dry-run.',
      );
      return;
    }
    console.log(`${testable.length} produto(s) ACTIVE candidato(s) (categoria mapeada, ainda sem vínculo TikTok Shop):`);
    console.log('----------------------------------------------------');
    for (const p of testable) {
      console.log(`  ${p.baseSku} — ${p.name} — categoria: ${p.category?.name ?? '—'} — ${p.eligibleCount} variante(s) elegível(is) (${p.id})`);
    }
    return;
  }

  await prisma.$disconnect();

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const productsPublish = app.get(TikTokProductsPublishService);
    const payload = await productsPublish.buildProductPayload(company.id, productId);
    console.log('Payload que SERIA enviado pra "Create Product" (nada foi criado de verdade):');
    console.log(JSON.stringify(payload, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
