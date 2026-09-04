/* eslint-disable no-console */
/**
 * Descobre a categoria sugerida pelo Mercado Livre a partir de um título de produto, e imprime a
 * ficha de atributos real dessa categoria (quais são obrigatórios pra publicar) — passo
 * necessário antes de programar a tela de "publicar no Mercado Livre" (ver
 * docs/integrations/mercado-livre.md, "Próximos passos", item 3). Cada categoria tem sua própria
 * ficha; nunca dá pra assumir um conjunto fixo de campos.
 *
 * Uso:
 *   npm run check-mercadolivre-category -- "Bolsa feminina de ombro"
 *   npm run check-mercadolivre-category -- "Bolsa feminina de ombro" MLB1234 (categoria específica, pula a sugestão)
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { MercadoLivreConnectorFactory } from '../integrations/mercadolivre/mercadolivre-connector.factory';

const SITE_ID = 'MLB';

async function main() {
  const title = process.argv[2];
  const explicitCategoryId = process.argv[3];
  if (!title) {
    console.error('Uso: npm run check-mercadolivre-category -- "<título do produto>" [categoryId opcional]');
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

    let categoryId = explicitCategoryId;
    if (!categoryId) {
      const predictions = await client.predictCategory(SITE_ID, title, 5);
      console.log('----------------------------------------------------');
      console.log(`Categorias sugeridas pro título "${title}":`);
      for (const p of predictions) {
        console.log(`  ${p.category_id} — ${p.category_name}${p.domain_name ? ` (domínio: ${p.domain_name})` : ''}`);
      }
      console.log('----------------------------------------------------');
      categoryId = predictions[0]?.category_id;
      if (!categoryId) {
        console.error('Nenhuma categoria sugerida — tente um título mais descritivo.');
        process.exitCode = 1;
        return;
      }
      console.log(`Usando a primeira sugestão (${categoryId}) para listar os atributos:\n`);
    }

    const attributes = await client.getCategoryAttributes(categoryId);
    console.log(`Total de atributos da categoria ${categoryId}: ${attributes.length}`);
    console.log('----------------------------------------------------');
    for (const attr of attributes) {
      const required = attr.tags?.required ? 'OBRIGATÓRIO' : 'opcional';
      const valueOptions = attr.values?.length ? ` — opções: ${attr.values.map((v) => v.name).join(', ')}` : '';
      console.log(`[${required}] ${attr.id} (${attr.name}) — tipo: ${attr.value_type ?? '—'}${valueOptions}`);
    }
    console.log('----------------------------------------------------');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
