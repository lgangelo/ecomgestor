/* eslint-disable no-console */
/**
 * Diagnóstico (somente leitura) — compara o `family_name` REAL salvo no Mercado Livre entre
 * vários itens (nunca o que a gente ACHA que mandou). Achado a investigar: dois produtos
 * publicados pelo mesmo código, com a mesma estrutura (um item por cor), aparecem de formas
 * diferentes na tela de edição do Mercado Livre — um agrupado como "2 variações", outro cada cor
 * sozinha. Hipótese: o `family_name` de verdade não bate character-a-character entre as cores de
 * um dos casos (nunca confirmamos que o que mandamos é exatamente o que o Mercado Livre guardou).
 *
 * Uso:
 *   npm run check-mercadolivre-family-names --workspace=@ecommerce-manager/api -- <itemId1> <itemId2> [...]
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { MercadoLivreApiError } from '@ecommerce-manager/integrations';
import { AppModule } from '../app.module';
import { MercadoLivreConnectorFactory } from '../integrations/mercadolivre/mercadolivre-connector.factory';

async function main() {
  const itemIds = process.argv.slice(2);
  if (itemIds.length === 0) {
    console.error('Uso: check-mercadolivre-family-names -- <itemId1> <itemId2> [...]');
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
    const connectorFactory = app.get(MercadoLivreConnectorFactory);
    const { client } = await connectorFactory.forCompany(company.id);

    const results: Array<{ id: string; familyName: unknown; status: unknown; permalink: unknown }> = [];
    for (const id of itemIds) {
      try {
        const item = await client.getItem(id);
        results.push({ id, familyName: item.family_name, status: item.status, permalink: item.permalink });
      } catch (error) {
        const message = error instanceof MercadoLivreApiError ? error.message : String(error);
        results.push({ id, familyName: `(erro: ${message})`, status: '?', permalink: '?' });
      }
    }

    console.log('======================================================');
    for (const r of results) {
      console.log(`Item ${r.id} | status: ${r.status} | family_name: ${JSON.stringify(r.familyName)}`);
      console.log(`  permalink: ${r.permalink}`);
    }

    const distinctFamilyNames = new Set(results.map((r) => JSON.stringify(r.familyName)));
    console.log('======================================================');
    console.log(
      distinctFamilyNames.size === 1
        ? 'Todos os itens têm o MESMO family_name — deveriam aparecer agrupados.'
        : `family_name DIFERENTE entre os itens (${distinctFamilyNames.size} valores distintos) — isso explica não agrupar.`,
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
