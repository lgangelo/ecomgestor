/* eslint-disable no-console */
/**
 * Carga inicial de pedidos do Mercado Livre — roda `MercadoLivreOrdersSyncService.syncOrders`
 * uma vez manualmente, pra trazer pro nosso banco os pedidos que já existem na plataforma antes
 * do job automático de reconciliação (`mercadolivre-reconcile-orders`) começar a rodar sozinho.
 * Só leitura na API do Mercado Livre + upsert idempotente no nosso banco (mesmo mecanismo da
 * reconciliação periódica) — seguro rodar mais de uma vez.
 *
 * Uso:
 *   npm run backfill-mercadolivre-orders --workspace=@ecommerce-manager/api
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { MercadoLivreOrdersSyncService } from '../integrations/mercadolivre/mercadolivre-orders-sync.service';

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
    const ordersSync = app.get(MercadoLivreOrdersSyncService);
    console.log(`Sincronizando pedidos do Mercado Livre para a empresa ${company.id}...`);
    const result = await ordersSync.syncOrders(company.id, null);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
