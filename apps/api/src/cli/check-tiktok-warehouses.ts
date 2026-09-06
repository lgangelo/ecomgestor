/* eslint-disable no-console */
/**
 * Diagnóstico — confirma contra uma chamada REAL o "Get Warehouse List" da TikTok Shop
 * (`GET /logistics/202309/warehouses`), achado só via documentação oficial — ver
 * `TikTokClient.getWarehouses`. NÃO CONFIRMADO ainda: o formato exato do corpo devolvido (bate
 * com `TikTokWarehouse[]`? vem paginado?) e, principalmente, se o app tem o escopo
 * `seller.logistics` habilitado nesta conta — diferente do resto da integração, que usa só
 * `seller.product.*`.
 *
 * Uso:
 *   npm run check-tiktok-warehouses --workspace=@ecommerce-manager/api --
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { TikTokConnectorFactory } from '../integrations/tiktok/tiktok-connector.factory';

async function main() {
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

    const result = await connector.getWarehouses();
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
