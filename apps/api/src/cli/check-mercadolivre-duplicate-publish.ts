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
 * ACHADO REAL (bug deste próprio script, corrigido): a consulta original buscava
 * `ChannelProductMapping` só por `variantId`, SEM filtrar por canal — misturava vínculos do
 * TikTok (que também usa este mesmo modelo de tabela) junto com os do Mercado Livre na mesma
 * lista. Isso levou a uma leitura errada de que "alguns produtos tinham variações agrupadas de
 * verdade no Mercado Livre" — na real, eram vínculos do TikTok (que suporta variações de verdade)
 * aparecendo misturados. Agora sempre mostra o canal (nome/tipo) de cada vínculo, nunca deixa
 * ambíguo de qual plataforma é.
 *
 * Este script busca produtos por um pedaço do nome e mostra, lado a lado:
 *   - as variantes do produto (id, sku, cor, tamanho, status, estoque);
 *   - o(s) vínculo(s) `ChannelProductMapping` ATUAIS pra essas variantes, EM QUALQUER CANAL (deveria
 *     ser no máximo 1 por variante POR CANAL, já que há uma constraint de unicidade em
 *     channelId+variantId — mas pode haver um vínculo de TikTok e outro de Mercado Livre pra
 *     mesma variante, ambos legítimos);
 *   - TODOS os eventos `MERCADOLIVRE_PRODUCT_PUBLISHED` já registrados no audit log pra essas
 *     variantes (esse evento é exclusivo do serviço de publicação do Mercado Livre, nunca do
 *     TikTok), com o `externalProductId` de cada um — se aparecer mais de um evento por variante,
 *     cada um com um item id diferente, é a marca registrada de "criou de novo porque achou que
 *     não tinha vínculo ainda".
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
        include: { channel: { select: { name: true, type: true } } },
      });
      // Um por (variante, canal) — nunca só por variante (uma mesma variante pode ter um vínculo
      // de TikTok e outro de Mercado Livre ao mesmo tempo, ambos legítimos).
      const mappingsByVariant = new Map<string, typeof mappings>();
      for (const m of mappings) {
        if (!m.variantId) continue;
        const list = mappingsByVariant.get(m.variantId) ?? [];
        list.push(m);
        mappingsByVariant.set(m.variantId, list);
      }

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
        const variantMappings = mappingsByVariant.get(variant.id) ?? [];
        if (variantMappings.length === 0) {
          console.log('    Vínculo ATUAL: (nenhum)');
        }
        for (const m of variantMappings) {
          console.log(
            `    Vínculo ATUAL [${m.channel.type} — ${m.channel.name}]: item ${m.externalProductId} (syncStatus ${m.syncStatus})`,
          );
        }
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
