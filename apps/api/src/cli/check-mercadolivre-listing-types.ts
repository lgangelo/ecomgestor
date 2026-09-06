/* eslint-disable no-console */
/**
 * Diagnóstico (somente leitura) — pedido do usuário: trocar o tipo de anúncio pra "Premium" (pra
 * habilitar parcelamento sem juros, confirmado via /performance como pendente). O código nunca
 * deve hard-codar um `listing_type_id` sem consultar a lista real primeiro (ver
 * docs/integrations/mercado-livre.md) — os nomes de exibição ("Clássico"/"Premium") não
 * necessariamente batem com o `id` técnico usado pela API (ex.: o "Clássico" de hoje já está
 * mapeado como `gold_special`, não como a palavra "classic"). Este script só imprime a lista real.
 *
 * Uso:
 *   npm run check-mercadolivre-listing-types --workspace=@ecommerce-manager/api
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { MercadoLivreConnectorFactory } from '../integrations/mercadolivre/mercadolivre-connector.factory';

const SITE_ID = 'MLB';

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
    const connectorFactory = app.get(MercadoLivreConnectorFactory);
    const { client } = await connectorFactory.forCompany(company.id);

    const listingTypes = await client.getListingTypes(SITE_ID);
    console.log(`Tipos de anúncio reais pro site ${SITE_ID}:`);
    console.log('----------------------------------------------------');
    for (const t of listingTypes) console.log(`  id: "${t.id}" — nome: "${t.name}"`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
