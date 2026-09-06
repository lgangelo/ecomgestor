/* eslint-disable no-console */
/**
 * Diagnóstico — revalida se as categorias JÁ MAPEADAS (`set-category-channel-mapping`) são
 * categorias FOLHA (leaf) de verdade na TikTok Shop.
 *
 * Achado real (pedido do usuário, depois de um erro persistente e confuso em "Get Attributes"):
 * `set-category-channel-mapping.ts` NUNCA validou isso — só grava o `externalCategoryId` que a
 * pessoa digitar, sem checar contra a árvore real. A doc oficial do "Get Attributes" é explícita:
 * "Note: It must be a leaf category" — uma categoria "de grupo" (com subcategorias, tipo "Bolsas"
 * como guarda-chuva de "Bolsa de Ombro"/"Bolsa Transversal"/etc.) não tem atributos próprios, e
 * pode ser exatamente a causa do erro genérico "invalid param error" (código `36009004`, confirmado
 * como um código COMUM/genérico na doc do "Create Product" — não específico de `shop_cipher`,
 * apesar do texto confuso da mensagem apontar pra lá).
 *
 * Pra cada categoria local mapeada, busca a TikTok Shop de novo por palavra-chave (mesmo jeito que
 * a pessoa provavelmente achou o id na primeira vez) e imprime o registro bruto do id configurado,
 * destacando se ele aparece como folha ou não (usa os nomes de campo reais devolvidos pela API,
 * sem assumir `is_leaf`/`isLeaf` de antemão).
 *
 * Uso:
 *   npm run check-tiktok-mapped-categories --workspace=@ecommerce-manager/api --
 */
import { NestFactory } from '@nestjs/core';
import { ChannelType, PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { TikTokConnectorFactory } from '../integrations/tiktok/tiktok-connector.factory';

function findNode(raw: unknown, id: string): Record<string, unknown> | undefined {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown>)?.categories)
      ? ((raw as Record<string, unknown>).categories as unknown[])
      : Array.isArray((raw as Record<string, unknown>)?.category_list)
        ? ((raw as Record<string, unknown>).category_list as unknown[])
        : [];
  return (list as Record<string, unknown>[]).find((c) => String(c.id ?? c.category_id) === id);
}

function countChildren(raw: unknown, parentId: string): number {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown>)?.categories)
      ? ((raw as Record<string, unknown>).categories as unknown[])
      : Array.isArray((raw as Record<string, unknown>)?.category_list)
        ? ((raw as Record<string, unknown>).category_list as unknown[])
        : [];
  return (list as Record<string, unknown>[]).filter((c) => String(c.parent_id ?? c.parentId ?? '') === parentId).length;
}

async function main() {
  const prisma = new PrismaClient();
  const company = await prisma.company.findFirst();
  if (!company) {
    console.error('Nenhuma empresa encontrada.');
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  const mappings = await prisma.categoryChannelMapping.findMany({
    where: { companyId: company.id, channelType: ChannelType.TIKTOK_SHOP },
    include: { category: { select: { name: true } } },
  });
  await prisma.$disconnect();

  if (mappings.length === 0) {
    console.log('Nenhuma categoria mapeada pra TikTok Shop ainda.');
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const connectorFactory = app.get(TikTokConnectorFactory);
    const { connector } = await connectorFactory.forCompany(company.id);

    for (const mapping of mappings) {
      const keyword = mapping.category.name;
      console.log(`\n=== ${mapping.category.name} → TikTok Shop "${mapping.externalCategoryId}" (busca: "${keyword}") ===`);
      try {
        const raw = await connector.getCategories({ keyword });
        const node = findNode(raw, mapping.externalCategoryId);
        if (!node) {
          console.log(
            `NÃO ENCONTRADO na busca por "${keyword}" — o id pode ter mudado, ou a busca por nome não bate mais com esse id. Resposta bruta:`,
          );
          console.log(JSON.stringify(raw, null, 2).slice(0, 2000));
          continue;
        }
        console.log('Nó encontrado (bruto):', JSON.stringify(node, null, 2));
        const childCount = countChildren(raw, mapping.externalCategoryId);
        if (childCount > 0) {
          console.log(`ATENÇÃO: ${childCount} categoria(s) aparecem com parent_id = ${mapping.externalCategoryId} nesta mesma busca — pode NÃO ser uma categoria folha.`);
        }
      } catch (error) {
        console.log('Erro ao buscar:', (error as Error).message);
      }
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err, err.code !== undefined ? `(código TikTok: ${err.code})` : '');
  process.exitCode = 1;
});
