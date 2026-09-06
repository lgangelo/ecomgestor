/* eslint-disable no-console */
/**
 * Diagnóstico (somente leitura) — pedido do usuário: "investigar todos os campos que fazem o
 * produto ter uma boa pontuação no Mercado Livre". Em vez de adivinhar a partir da ficha de
 * atributos da categoria (que só diz o que É POSSÍVEL preencher, não o que realmente pesa na
 * qualidade/ranking), chama o endpoint oficial de qualidade de publicação
 * (`GET /item/{id}/performance`, documentado como substituto do antigo `/health`) contra um item
 * REAL já publicado nesta conta, e imprime a resposta bruta — ainda NÃO CONFIRMADO nesta conta,
 * primeiro uso real desta chamada.
 *
 * Uso:
 *   npm run check-mercadolivre-item-performance --workspace=@ecommerce-manager/api -- MLB1234567890
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { MercadoLivreConnectorFactory } from '../integrations/mercadolivre/mercadolivre-connector.factory';

async function main() {
  const itemId = process.argv[2];
  if (!itemId) {
    console.error('Uso: npm run check-mercadolivre-item-performance -- MLB1234567890');
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

    const performance = await client.getItemPerformance(itemId);
    console.log(`Qualidade da publicação — item ${itemId}:`);
    console.log('----------------------------------------------------');
    console.log(JSON.stringify(performance, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
