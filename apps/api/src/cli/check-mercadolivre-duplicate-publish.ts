/* eslint-disable no-console */
/**
 * Diagnóstico (somente leitura) pra achar a causa real de anúncios duplicados no Mercado Livre —
 * achado do usuário (tela de exclusão em massa do ML mostrando 157 anúncios, muitos com o mesmo
 * produto/preço/foto repetidos, cada um com um # de anúncio diferente).
 *
 * Hipótese a confirmar: se `client.createItem` tiver sucesso mas o `channelProductMapping.upsert`
 * seguinte falhar (ex.: conflito de unicidade), o item fica criado no Mercado Livre mas o vínculo
 * NUNCA é salvo — no próximo ciclo do agendador, `publishEligible` não teria como saber que aquele
 * produto já foi publicado, e cria outro item. Isso se repetiria a cada ciclo, gerando um anúncio
 * novo por vez, indefinidamente.
 *
 * Este script busca produtos por um pedaço do nome e mostra, lado a lado:
 *   - as variantes do produto (id, sku, cor, tamanho, status, estoque);
 *   - o(s) vínculo(s) `ChannelProductMapping` ATUAIS pra essas variantes (deveria ser no máximo 1
 *     por variante, já que há uma constraint de unicidade em channelId+variantId);
 *   - TODOS os eventos `MERCADOLIVRE_PRODUCT_PUBLISHED` já registrados no audit log pra essas
 *     variantes, com o `externalProductId` de cada um — se aparecer mais de um evento por
 *     variante, cada um com um item id diferente, é a marca registrada de "criou de novo porque
 *     achou que não tinha vínculo ainda".
 *
 * Uso:
 *   npm run check-mercadolivre-duplicate-publish --workspace=@ecommerce-manager/api -- "Bolsa Chique"
 */
import { PrismaClient } from '@ecommerce-manager/database';

async function main() {
  const query = process.argv[2];
  if (!query) {
    console.error('Uso: check-mercadolivre-duplicate-publish -- "pedaço do nome do produto"');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const products = await prisma.product.findMany({
      where: { name: { contains: query, mode: 'insensitive' } },
      include: { variants: { orderBy: { createdAt: 'asc' } } },
    });

    if (products.length === 0) {
      console.log(`Nenhum produto encontrado com "${query}" no nome.`);
      return;
    }

    for (const product of products) {
      console.log('======================================================');
      console.log(`Produto: ${product.name} (${product.id}) — status ${product.status}`);
      const variantIds = product.variants.map((v) => v.id);

      const mappings = await prisma.channelProductMapping.findMany({
        where: { variantId: { in: variantIds } },
      });
      const mappingByVariant = new Map(mappings.map((m) => [m.variantId, m]));

      const auditEvents = await prisma.auditLog.findMany({
        where: { entity: 'channel_product_mapping', entityId: { in: variantIds } },
        orderBy: { createdAt: 'asc' },
      });
      const eventsByVariant = new Map<string, typeof auditEvents>();
      for (const event of auditEvents) {
        if (!event.entityId) continue;
        const list = eventsByVariant.get(event.entityId) ?? [];
        list.push(event);
        eventsByVariant.set(event.entityId, list);
      }

      for (const variant of product.variants) {
        console.log(
          `  Variante ${variant.sku} (${variant.id}) — cor=${variant.color ?? '—'} tamanho=${variant.size ?? '—'} status=${variant.status}`,
        );
        const mapping = mappingByVariant.get(variant.id);
        console.log(
          `    Vínculo ATUAL: ${mapping ? `item ${mapping.externalProductId} (syncStatus ${mapping.syncStatus})` : '(nenhum)'}`,
        );
        const events = eventsByVariant.get(variant.id) ?? [];
        console.log(`    Eventos MERCADOLIVRE_PRODUCT_PUBLISHED registrados: ${events.length}`);
        for (const event of events) {
          const externalProductId = (event.newValue as { externalProductId?: string } | null)?.externalProductId;
          console.log(`      ${event.createdAt.toISOString()} — item ${externalProductId ?? '(desconhecido)'}`);
        }
        if (events.length > 1) {
          const distinctItems = new Set(
            events.map((e) => (e.newValue as { externalProductId?: string } | null)?.externalProductId),
          );
          if (distinctItems.size > 1) {
            console.log(
              `    >>> SUSPEITA CONFIRMADA: ${distinctItems.size} itens diferentes criados pra esta variante ao longo do tempo.`,
            );
          }
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
