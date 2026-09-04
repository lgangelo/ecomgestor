/* eslint-disable no-console */
/**
 * Backfill único: espelha fotos de produto/variação que hoje apontam pra um domínio EXTERNO
 * (ex.: CDN da TikTok, `https://p16-oec-sg.ibyteimg.com/...`) pro nosso próprio armazenamento —
 * mesmo mecanismo que a sincronização da TikTok já usa a partir de agora pra fotos NOVAS
 * (`ProductsService.mirrorExternalImage`, ver `TikTokProductsSyncService`). Produtos importados
 * ANTES dessa mudança continuam com a URL externa antiga até este script rodar uma vez.
 *
 * CONFIRMADO em produção: uma rede móvel bloqueando o domínio da TikTok fazia a foto de capa
 * sumir só naquele aparelho/rede (mesmo com a URL correta e o produto aparecendo normal no
 * desktop) — servir sempre pelo nosso próprio domínio elimina essa dependência de terceiro.
 *
 * Uso:
 *   npm run backfill-mirror-product-images
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { ProductsService } from '../products/products.service';

const EXTERNAL_URL_PATTERN = /^https?:\/\//;

async function main() {
  const prisma = new PrismaClient();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  let mirrored = 0;
  let failed = 0;
  const failures: Array<{ kind: 'produto' | 'variação'; id: string; error: string }> = [];

  try {
    const productsService = app.get(ProductsService);

    const products = await prisma.product.findMany({
      where: { imageUrl: { startsWith: 'http' } },
      select: { id: true, companyId: true, imageUrl: true },
    });
    for (const product of products) {
      if (!product.imageUrl || !EXTERNAL_URL_PATTERN.test(product.imageUrl)) continue;
      try {
        const newUrl = await productsService.mirrorExternalImage(product.companyId, product.imageUrl);
        await prisma.product.update({ where: { id: product.id }, data: { imageUrl: newUrl } });
        mirrored++;
      } catch (error) {
        failed++;
        failures.push({ kind: 'produto', id: product.id, error: error instanceof Error ? error.message : 'Erro desconhecido' });
      }
    }

    const variants = await prisma.productVariant.findMany({
      where: { imageUrl: { startsWith: 'http' } },
      select: { id: true, imageUrl: true, product: { select: { companyId: true } } },
    });
    for (const variant of variants) {
      if (!variant.imageUrl || !EXTERNAL_URL_PATTERN.test(variant.imageUrl)) continue;
      try {
        const newUrl = await productsService.mirrorExternalImage(variant.product.companyId, variant.imageUrl);
        await prisma.productVariant.update({ where: { id: variant.id }, data: { imageUrl: newUrl } });
        mirrored++;
      } catch (error) {
        failed++;
        failures.push({ kind: 'variação', id: variant.id, error: error instanceof Error ? error.message : 'Erro desconhecido' });
      }
    }

    console.log('----------------------------------------------------');
    console.log(`Espelhadas com sucesso: ${mirrored}`);
    console.log(`Falhas: ${failed}`);
    for (const f of failures) console.log(`  falha em ${f.kind} ${f.id}: ${f.error}`);
    console.log('----------------------------------------------------');
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Erro no backfill:', err.message ?? err);
  process.exitCode = 1;
});
