/* eslint-disable no-console */
/**
 * Diagnóstico — confirma contra uma chamada REAL o "Get Category Rules" e o "Get Attributes" da
 * TikTok Shop (`GET /product/202309/categories/{category_id}/rules` e
 * `.../attributes`), pra saber quais campos são obrigatórios antes de publicar um produto nessa
 * categoria (ver `TikTokClient.getCategoryRules` e `TikTokClient.getCategoryAttributes`).
 *
 * Cada chamada roda isolada (com seu próprio try/catch) — uma falhar nunca esconde o resultado da
 * outra, diferente da versão anterior deste script (sequencial sem tratamento, então um erro em
 * "Rules" nunca deixava ver "Attributes"). Aceita um `categoryVersion` opcional pra testar se
 * omitir o parâmetro (deixando a TikTok assumir o default documentado, `v1` pra BR) se comporta
 * diferente de mandar explicitamente — achado real: "Get Attributes" respondeu um erro genérico
 * ("invalid param error", código `36009004`) contra a categoria "Bolsas" (`601445`, confirmada
 * como categoria FOLHA de verdade via `check-tiktok-mapped-categories`), sem explicação óbvia
 * ainda — testar com `category_version` explícito é o próximo passo, nunca adivinhado sem testar.
 *
 * Uso:
 *   npm run check-tiktok-category-attributes --workspace=@ecommerce-manager/api -- 600001
 *   npm run check-tiktok-category-attributes --workspace=@ecommerce-manager/api -- 600001 v1
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { TikTokConnectorFactory } from '../integrations/tiktok/tiktok-connector.factory';

async function main() {
  const categoryId = process.argv[2];
  const categoryVersion = process.argv[3] as 'v1' | 'v2' | undefined;
  if (!categoryId) {
    console.error('Uso: npm run check-tiktok-category-attributes -- <categoryId> [categoryVersion opcional: v1|v2]');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  const company = await prisma.company.findFirst();
  await prisma.$disconnect();
  if (!company) {
    console.error('Nenhuma empresa encontrada.');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const connectorFactory = app.get(TikTokConnectorFactory);
    const { connector } = await connectorFactory.forCompany(company.id);

    console.log(`categoryId=${categoryId} categoryVersion=${categoryVersion ?? '(omitido — TikTok deveria assumir v1 pra BR)'}`);

    console.log('\n=== Category Rules ===');
    try {
      const rules = await connector.getCategoryRules(categoryId, categoryVersion);
      console.log(JSON.stringify(rules, null, 2));
    } catch (error) {
      const err = error as Error & { code?: number };
      console.log('Erro:', err.message, err.code !== undefined ? `(código TikTok: ${err.code})` : '');
    }

    console.log('\n=== Category Attributes ===');
    try {
      const attributes = await connector.getCategoryAttributes(categoryId, categoryVersion);
      console.log(`Total de atributos da categoria ${categoryId}: ${attributes.length}`);
      console.log('----------------------------------------------------');
      for (const attr of attributes) {
        const required = attr.isRequired ? 'obrigatório' : 'opcional';
        const valueOptions = attr.values?.length ? ` — valores: ${attr.values.map((v) => v.name).join(', ')}` : '';
        console.log(`[${required}] ${attr.id} (${attr.name}) — tipo: ${attr.type}${valueOptions}`);
        console.log(`    isCustomizable: ${attr.isCustomizable}`);
      }
      console.log('----------------------------------------------------');
    } catch (error) {
      const err = error as Error & { code?: number };
      console.log('Erro:', err.message, err.code !== undefined ? `(código TikTok: ${err.code})` : '');
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err, err.code !== undefined ? `(código TikTok: ${err.code})` : '');
  process.exitCode = 1;
});
