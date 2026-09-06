/* eslint-disable no-console */
/**
 * Diagnóstico — confirma contra uma chamada REAL o "Get Category Rules" e o "Get Attributes" da
 * TikTok Shop (`GET /product/202309/categories/{category_id}/rules` e
 * `.../attributes`), pra saber quais campos são obrigatórios antes de publicar um produto nessa
 * categoria (ver `TikTokClient.getCategoryRules` e `TikTokClient.getCategoryAttributes`).
 *
 * `getCategoryRules` NÃO CONFIRMADO ainda (a doc não mostrou um exemplo de resposta completo) —
 * imprime o corpo bruto. `getCategoryAttributes` já foi CONFIRMADO via documentação (exemplo de
 * resposta reproduzido literalmente, inclusive o typo real da TikTok `is_requried`), mas nunca
 * contra uma chamada real nesta conta — imprime formatado, um atributo por linha.
 *
 * Uso:
 *   npm run check-tiktok-category-attributes --workspace=@ecommerce-manager/api -- 600001
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { TikTokConnectorFactory } from '../integrations/tiktok/tiktok-connector.factory';

async function main() {
  const categoryId = process.argv[2];
  if (!categoryId) {
    console.error('Uso: npm run check-tiktok-category-attributes -- <categoryId>');
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

    const rules = await connector.getCategoryRules(categoryId);
    console.log('=== Category Rules ===');
    console.log(JSON.stringify(rules, null, 2));

    const attributes = await connector.getCategoryAttributes(categoryId);
    console.log('=== Category Attributes ===');
    console.log(`Total de atributos da categoria ${categoryId}: ${attributes.length}`);
    console.log('----------------------------------------------------');
    for (const attr of attributes) {
      const required = attr.isRequired ? 'obrigatório' : 'opcional';
      const valueOptions = attr.values?.length ? ` — valores: ${attr.values.map((v) => v.name).join(', ')}` : '';
      console.log(`[${required}] ${attr.id} (${attr.name}) — tipo: ${attr.type}${valueOptions}`);
      console.log(`    isCustomizable: ${attr.isCustomizable}`);
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
