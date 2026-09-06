/* eslint-disable no-console */
/**
 * Primeira publicação REAL de um produto na TikTok Shop (chama `createProduct` de verdade, cria
 * o anúncio) — pedido do usuário: testar com segurança 1 produto real antes de confiar no ciclo
 * automático completo (`TikTokProductsPublishService.publishEligible`, ainda desligado via
 * `tiktok.productsSyncEnabled`) pra todo o catálogo.
 *
 * Diferente de `check-tiktok-publish-dry-run` (só monta o payload, nunca cria nada de verdade) —
 * este AQUI CRIA o produto na conta real conectada. Produto precisa estar ACTIVE, com categoria
 * mapeada (`set-category-channel-mapping`) e pelo menos 1 variante ACTIVE ainda não publicada.
 *
 * CUIDADO: isso cria um produto de verdade na TikTok Shop (entra em análise/revisão deles, pode
 * ficar visível pra compradores depois de aprovado) — rodar este script tem efeito real.
 *
 * Uso:
 *   npm run publish-tiktok-item --workspace=@ecommerce-manager/api -- <productId>
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { TikTokApiError } from '@ecommerce-manager/integrations';
import { AppModule } from '../app.module';
import { TikTokProductsPublishService } from '../integrations/tiktok/tiktok-products-publish.service';

async function main() {
  const productId = process.argv[2];
  if (!productId) {
    console.error('Uso: npm run publish-tiktok-item --workspace=@ecommerce-manager/api -- <productId>');
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
    console.log('Publicando de verdade (isso cria o produto na TikTok Shop)...');
    const result = await productsPublish.publishSingleProduct(company.id, productId);
    console.log(`Produto criado: product_id=${result.externalProductId} (${result.variantsPublished} variação(ões) vinculada(s)).`);
    console.log('Confira no painel da TikTok Shop (Seller Center → Produtos) o status de revisão.');
  } catch (error) {
    if (error instanceof TikTokApiError) {
      console.error(`Falha (${error.category}, HTTP ${error.statusCode ?? '—'}, código ${error.code ?? '—'}): ${error.message}`);
    } else {
      console.error('Erro:', error instanceof Error ? error.message : error);
    }
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
