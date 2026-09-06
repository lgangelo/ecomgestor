/* eslint-disable no-console */
/**
 * Diagnóstico — confirma contra uma chamada REAL o "Get Categories" da TikTok Shop
 * (`GET /product/202309/categories`), achado só via documentação oficial (que não mostrou um
 * exemplo de resposta completo, só os parâmetros de busca) — ver `TikTokClient.getCategories`.
 * NÃO CONFIRMADO ainda: o formato exato do corpo devolvido (lista de categorias? paginado?
 * campos `is_leaf`/`local_name`/`parent_id` batem com `TikTokCategory`?) e se `category_version`
 * muda a forma da resposta.
 *
 * Uso:
 *   npm run check-tiktok-categories --workspace=@ecommerce-manager/api -- "Bolsa feminina"
 *   npm run check-tiktok-categories --workspace=@ecommerce-manager/api -- "Bolsa feminina" v1
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { TikTokConnectorFactory } from '../integrations/tiktok/tiktok-connector.factory';

async function main() {
  const keyword = process.argv[2];
  const categoryVersion = process.argv[3] as 'v1' | 'v2' | undefined;
  if (!keyword) {
    console.error('Uso: npm run check-tiktok-categories -- "<palavra-chave>" [categoryVersion opcional: v1|v2]');
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

    const result = await connector.getCategories({ keyword, categoryVersion });
    console.log('Resposta bruta:');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
