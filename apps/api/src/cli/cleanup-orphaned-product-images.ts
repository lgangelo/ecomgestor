/* eslint-disable no-console */
/**
 * Limpeza de fotos "órfãs" (pedido do usuário) — desde que o upload passou a nomear os arquivos
 * pelo SKU (ver `ProductsService.saveImageFile`), fica fácil auditar visualmente o bucket, mas
 * ainda sobram arquivos sem nenhuma referência no banco: fotos substituídas antes dessa mudança
 * (nome antigo em UUID, nunca apagado porque a troca só some a referência, não o arquivo, em
 * casos de falha parcial), produtos/variantes excluídos sem passar pelo fluxo normal, ou uploads
 * que falharam depois de gravar o arquivo mas antes de salvar a referência no banco.
 *
 * Este script lista todos os objetos do bucket público de imagens (só funciona com R2 habilitado
 * — sem R2, as fotos ficam no disco local do container, fora do escopo deste script) sob
 * `imagens/{companyId}/`, cruza com todas as URLs referenciadas em `Product.imageUrl`,
 * `ProductVariant.imageUrl` e `ProductImage.url`, e reporta o que sobra.
 *
 * Modo diagnóstico (padrão): só lista os órfãos encontrados, nenhuma chamada de escrita.
 * Modo --confirm: apaga de fato os objetos órfãos do bucket.
 *
 * Uso:
 *   npm run cleanup-orphaned-product-images --workspace=@ecommerce-manager/api
 *   npm run cleanup-orphaned-product-images --workspace=@ecommerce-manager/api -- --confirm
 */
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { R2StorageService } from '../common/storage/r2-storage.service';

async function main() {
  const confirm = process.argv.includes('--confirm');

  const prisma = new PrismaClient();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const config = app.get(ConfigService);
    const r2Config = config.get<{ enabled: boolean; imagesBucket: string; imagesPublicBaseUrl: string }>('r2')!;
    if (!r2Config.enabled) {
      console.error('R2 não está habilitado (R2_ENDPOINT/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_IMAGES_BUCKET) — nada a fazer.');
      process.exitCode = 1;
      return;
    }

    const company = await prisma.company.findFirst();
    if (!company) {
      console.error('Nenhuma empresa encontrada.');
      process.exitCode = 1;
      return;
    }

    const r2 = app.get(R2StorageService);
    const prefix = `imagens/${company.id}/`;
    console.log(`Listando objetos em ${r2Config.imagesBucket}/${prefix}...`);
    const allKeys = await r2.listObjectKeys(r2Config.imagesBucket, prefix);
    console.log(`Total de arquivos no bucket: ${allKeys.length}.`);

    const [products, variants, images] = await Promise.all([
      prisma.product.findMany({ where: { companyId: company.id }, select: { imageUrl: true } }),
      prisma.productVariant.findMany({ where: { product: { companyId: company.id } }, select: { imageUrl: true } }),
      prisma.productImage.findMany({ where: { product: { companyId: company.id } }, select: { url: true } }),
    ]);
    const usedUrls = new Set<string>();
    for (const p of products) if (p.imageUrl) usedUrls.add(p.imageUrl);
    for (const v of variants) if (v.imageUrl) usedUrls.add(v.imageUrl);
    for (const i of images) usedUrls.add(i.url);

    const usedKeys = new Set(
      [...usedUrls]
        .filter((url) => url.startsWith(`${r2Config.imagesPublicBaseUrl}/`))
        .map((url) => url.slice(`${r2Config.imagesPublicBaseUrl}/`.length)),
    );

    const orphanedKeys = allKeys.filter((key) => !usedKeys.has(key));

    console.log('======================================================');
    console.log(`Referenciados no banco: ${usedKeys.size} | Órfãos encontrados: ${orphanedKeys.length}.`);
    for (const key of orphanedKeys) {
      console.log(`  ${key}`);
    }

    if (orphanedKeys.length === 0) {
      console.log('Nada a limpar.');
      return;
    }

    if (!confirm) {
      console.log('Modo DIAGNÓSTICO — nada foi apagado. Rode de novo com --confirm pra apagar de fato.');
      return;
    }

    let deleted = 0;
    for (const key of orphanedKeys) {
      await r2.deleteObject(r2Config.imagesBucket, key);
      deleted++;
    }
    console.log(`Apagados: ${deleted} arquivo(s) órfão(s).`);
  } finally {
    await prisma.$disconnect();
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
