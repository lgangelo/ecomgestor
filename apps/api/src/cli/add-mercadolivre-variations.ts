/* eslint-disable no-console */
/**
 * Segunda etapa real: adiciona as variações de cor (com preço/estoque próprios, inclusive
 * zerado) a um anúncio já criado por `publish-mercadolivre-item.ts` — nunca cria um anúncio
 * novo, sempre atualiza o existente (`PUT /items/:id`), pra não duplicar. Formato de
 * `variations[]`/`picture_ids` NÃO CONFIRMADO ainda contra uma chamada real (ver
 * docs/integrations/mercado-livre.md) — primeira tentativa, deve iterar sobre o erro real como
 * todo o resto desta integração até agora.
 *
 * Feito em duas chamadas PUT sequenciais e seguras:
 *   1) Envia todas as fotos (uma por variação de cor, com fallback pra foto de capa do produto)
 *      — a resposta devolve o `id` real atribuído a cada foto.
 *   2) Envia as variações propriamente ditas, cada uma referenciando o `id` de foto certo.
 *
 * CUIDADO: atualiza um anúncio PÚBLICO de verdade.
 *
 * Uso:
 *   npm run add-mercadolivre-variations --workspace=@ecommerce-manager/api -- <productId> <mlItemId>
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { MercadoLivreApiError } from '@ecommerce-manager/integrations';
import { AppModule } from '../app.module';
import { ProductsService } from '../products/products.service';
import { MercadoLivreConnectorFactory } from '../integrations/mercadolivre/mercadolivre-connector.factory';

async function main() {
  const productId = process.argv[2];
  const mlItemId = process.argv[3];
  if (!productId || !mlItemId) {
    console.error('Uso: npm run add-mercadolivre-variations --workspace=@ecommerce-manager/api -- <productId> <mlItemId>');
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
    const productsService = app.get(ProductsService);
    const connectorFactory = app.get(MercadoLivreConnectorFactory);
    const { client } = await connectorFactory.forCompany(company.id);

    const product = await productsService.findOne(productId, company.id);
    const variantsWithColor = product.variants.filter((v) => v.color);
    if (variantsWithColor.length === 0) {
      console.error('Nenhuma variação com cor definida — nada a fazer.');
      process.exitCode = 1;
      return;
    }

    console.log(`Lendo o anúncio ${mlItemId} pra confirmar categoria/estado atual...`);
    const item = await client.getItem(mlItemId);
    const categoryId = item.category_id as string;
    console.log(`Categoria do anúncio: ${categoryId}`);

    const categoryAttributes = await client.getCategoryAttributes(categoryId);
    const colorAttribute = categoryAttributes.find((a) => a.id === 'COLOR');
    if (!colorAttribute?.values?.length) {
      console.error('Categoria não tem atributo COLOR com lista de valores — não dá pra montar variações por cor.');
      process.exitCode = 1;
      return;
    }

    const resolvedVariants: Array<{
      variant: (typeof variantsWithColor)[number];
      colorValueId: string;
      imageUrl: string;
    }> = [];
    for (const variant of variantsWithColor) {
      const colorValue = colorAttribute.values.find((v) => v.name.toLowerCase() === variant.color!.toLowerCase());
      if (!colorValue) {
        console.warn(`Cor "${variant.color}" (SKU ${variant.sku}) não encontrada na lista da categoria — pulando esta variação.`);
        continue;
      }
      const imageUrl = variant.imageUrl && /^https?:\/\//.test(variant.imageUrl) ? variant.imageUrl : product.imageUrl;
      if (!imageUrl || !/^https?:\/\//.test(imageUrl)) {
        console.warn(`Variação ${variant.sku} sem foto pública (nem própria nem de capa) — pulando.`);
        continue;
      }
      resolvedVariants.push({ variant, colorValueId: colorValue.id, imageUrl });
    }
    if (resolvedVariants.length === 0) {
      console.error('Nenhuma variação pôde ser resolvida (cor não reconhecida ou sem foto) — nada enviado.');
      process.exitCode = 1;
      return;
    }

    // Passo 1: envia todas as fotos únicas primeiro, pra descobrir o `id` real que o Mercado
    // Livre atribui a cada uma (necessário pra referenciar em `picture_ids` das variações).
    const uniqueUrls = [...new Set(resolvedVariants.map((r) => r.imageUrl))];
    console.log(`Enviando ${uniqueUrls.length} foto(s) únicas pro anúncio...`);
    const withPictures = await client.updateItem(mlItemId, { pictures: uniqueUrls.map((source) => ({ source })) });
    const returnedPictures = (withPictures.pictures as Array<{ id: string; url?: string; secure_url?: string }>) ?? [];
    console.log('Fotos retornadas pela API:', JSON.stringify(returnedPictures, null, 2));

    const pictureIdByUrl = new Map<string, string>();
    uniqueUrls.forEach((url, index) => {
      const picture = returnedPictures[index];
      if (picture?.id) pictureIdByUrl.set(url, picture.id);
    });

    // Passo 2: monta as variações — preço e estoque PRÓPRIOS por variação (inclusive 0, quando o
    // usuário confirmou explicitamente que produtos sem estoque devem aparecer esgotados, nunca
    // omitidos do anúncio).
    const variationsPayload = resolvedVariants.map(({ variant, colorValueId, imageUrl }) => {
      const pictureId = pictureIdByUrl.get(imageUrl);
      return {
        attribute_combinations: [{ id: 'COLOR', value_id: colorValueId }],
        price: Number(variant.suggestedPrice),
        available_quantity: variant.inventory.available,
        ...(pictureId ? { picture_ids: [pictureId] } : {}),
      };
    });

    console.log('----------------------------------------------------');
    console.log('Payload de variações que será enviado:');
    console.log(JSON.stringify(variationsPayload, null, 2));
    console.log('----------------------------------------------------');

    const updated = await client.updateItem(mlItemId, { variations: variationsPayload });
    console.log('Atualizado com sucesso. Resposta:', JSON.stringify(updated.variations, null, 2));
  } catch (error) {
    if (error instanceof MercadoLivreApiError) {
      console.error(`Falha (${error.category}, HTTP ${error.statusCode ?? '—'}): ${error.message}`);
      console.error('Corpo bruto da resposta:', JSON.stringify(error.rawResponse, null, 2));
    } else {
      console.error('Erro:', error);
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
