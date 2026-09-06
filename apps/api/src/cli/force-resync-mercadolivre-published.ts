/* eslint-disable no-console */
/**
 * Roda `MercadoLivreProductsSyncService.syncPublished` em modo FORÇADO — pedido explícito do
 * usuário: reenviar preço/fotos/status/descrição/dados fiscais pra TODO o catálogo já publicado
 * no Mercado Livre de uma vez, ignorando o hash "já sincronizado" e o limite de 50 por ciclo do
 * scheduler automático. Serve pra descolar o bug de fotos duplicadas em variações (algumas cores
 * mostrando a mesma foto) mesmo quando o ciclo automático ainda não tinha reprocessado tudo.
 *
 * Chama a API real do Mercado Livre pra cada item mapeado — não é dry-run.
 *
 * Uso:
 *   npm run force-resync-mercadolivre-published --workspace=@ecommerce-manager/api --
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { MercadoLivreProductsSyncService } from '../integrations/mercadolivre/mercadolivre-products-sync.service';

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
    const productsSync = app.get(MercadoLivreProductsSyncService);
    console.log('Reenviando de verdade pra TODO o catálogo publicado (isso pode demorar)...');
    const result = await productsSync.syncPublished(company.id, { force: true });
    console.log('Resultado:', JSON.stringify(result, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
