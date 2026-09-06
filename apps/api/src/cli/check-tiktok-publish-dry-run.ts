/* eslint-disable no-console */
/**
 * Dry-run manual (pedido do usuário: testar contra 1 produto antes de ligar o ciclo automático
 * pra todo o catálogo) — monta o payload REAL de `createProduct` pra UM produto (faz upload de
 * verdade das imagens, resolve categoria/armazém/atributos de cor-tamanho), imprime pra revisão,
 * e PARA — nunca chama `createProduct` de fato. Produto precisa estar ACTIVE, com categoria
 * mapeada (`set-category-channel-mapping`) e pelo menos 1 variante ainda não publicada na TikTok
 * Shop.
 *
 * Uso:
 *   npm run check-tiktok-publish-dry-run --workspace=@ecommerce-manager/api -- <productId>
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { TikTokProductsPublishService } from '../integrations/tiktok/tiktok-products-publish.service';

async function main() {
  const productId = process.argv[2];
  if (!productId) {
    console.error('Uso: npm run check-tiktok-publish-dry-run -- <productId>');
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
    const productsPublish = app.get(TikTokProductsPublishService);
    const payload = await productsPublish.buildProductPayload(company.id, productId);
    console.log('Payload que SERIA enviado pra "Create Product" (nada foi criado de verdade):');
    console.log(JSON.stringify(payload, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
