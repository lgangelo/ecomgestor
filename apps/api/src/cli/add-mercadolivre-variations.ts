/* eslint-disable no-console */
/**
 * Segunda etapa real: adiciona as demais cores de um produto ao anúncio já criado por
 * `publish-mercadolivre-item.ts`. CONFIRMADO em produção (erro real
 * "item.with_family_name.not_allowed_variations") que o modelo clássico `variations[]` NÃO
 * funciona junto com `family_name` — no modelo "User Products" do Mercado Livre, cada cor vira
 * um ANÚNCIO PRÓPRIO (item separado), todos compartilhando o MESMO `family_name`; é assim que a
 * plataforma os agrupa como "escolha a cor" na página do comprador (ver
 * docs/integrations/mercado-livre.md).
 *
 * O item já existente é só atualizado (PUT, sem tocar em `variations`) pra ganhar seu próprio
 * atributo COLOR; as demais cores viram itens NOVOS (POST), com o mesmo family_name/categoria/
 * tipo de publicação, preço e estoque PRÓPRIOS (inclusive zero).
 *
 * CUIDADO: cria/atualiza anúncios PÚBLICOS de verdade.
 *
 * Uso:
 *   npm run add-mercadolivre-variations --workspace=@ecommerce-manager/api -- <productId> <mlItemId>
 */
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@ecommerce-manager/database';
import { MercadoLivreApiError } from '@ecommerce-manager/integrations';
import { AppModule } from '../app.module';
import { ProductsService } from '../products/products.service';
import { MercadoLivreConnectorFactory } from '../integrations/mercadolivre/mercadolivre-connector.factory';

const BRAND_FALLBACK_NAME = 'Generic';

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
    const configService = app.get(ConfigService);
    const priceMarkupPercent = configService.get<{ priceMarkupPercent: number }>('mercadoLivre')!.priceMarkupPercent;
    const { client } = await connectorFactory.forCompany(company.id);

    const product = await productsService.findOne(productId, company.id);
    const variantsWithColor = product.variants.filter((v) => v.color);
    if (variantsWithColor.length === 0) {
      console.error('Nenhuma variação com cor definida — nada a fazer.');
      process.exitCode = 1;
      return;
    }

    console.log(`Lendo o anúncio base ${mlItemId}...`);
    const baseItem = await client.getItem(mlItemId);
    const categoryId = baseItem.category_id as string;
    const familyName = baseItem.family_name as string;
    const listingTypeId = baseItem.listing_type_id as string;
    const baseAttributes = (baseItem.attributes as Array<{ id: string; value_name?: string }>) ?? [];
    const baseSellerSku = baseAttributes.find((a) => a.id === 'SELLER_SKU')?.value_name;
    console.log(`Categoria: ${categoryId} | family_name: "${familyName}" | listing_type_id: ${listingTypeId}`);

    const baseVariant = variantsWithColor.find((v) => v.sku === baseSellerSku) ?? variantsWithColor[0];
    if (baseSellerSku && baseVariant.sku !== baseSellerSku) {
      console.warn(`Não achei a variação com SKU "${baseSellerSku}" no produto — usando ${baseVariant.sku} como base por padrão.`);
    }
    console.log(`Variação já representada pelo anúncio base: ${baseVariant.sku} (cor: ${baseVariant.color})`);

    const categoryAttributes = await client.getCategoryAttributes(categoryId);
    const colorAttribute = categoryAttributes.find((a) => a.id === 'COLOR');
    const brandAttribute = categoryAttributes.find((a) => a.id === 'BRAND');
    const brandValue = brandAttribute?.values?.find((v) => v.name.toLowerCase() === BRAND_FALLBACK_NAME.toLowerCase());
    if (!colorAttribute?.values?.length || !brandValue) {
      console.error('Categoria sem atributo COLOR com lista de valores, ou sem o valor de marca "Generic" — abortando.');
      process.exitCode = 1;
      return;
    }

    function resolveColorValueId(colorName: string): string | undefined {
      return colorAttribute!.values!.find((v) => v.name.toLowerCase() === colorName.toLowerCase())?.id;
    }

    function priceFor(variant: (typeof variantsWithColor)[number]): number {
      const base = Number(variant.suggestedPrice);
      return Math.round(base * (1 + priceMarkupPercent / 100) * 100) / 100;
    }

    // 1) Atualiza o anúncio base só com o atributo COLOR (nunca toca em `variations` —
    // CONFIRMADO que isso conflita com family_name).
    const baseColorValueId = resolveColorValueId(baseVariant.color!);
    if (!baseColorValueId) {
      console.warn(`Cor "${baseVariant.color}" da variação base não encontrada na lista da categoria — não foi possível marcar.`);
    } else {
      await client.updateItem(mlItemId, {
        attributes: [...baseAttributes.filter((a) => a.id !== 'COLOR'), { id: 'COLOR', value_id: baseColorValueId }],
      });
      console.log(`Anúncio base atualizado com COLOR="${baseVariant.color}".`);
    }

    // 2) Cria um anúncio NOVO pra cada outra cor, com o MESMO family_name — é assim que o
    // Mercado Livre os agrupa como variações visíveis pro comprador.
    const otherVariants = variantsWithColor.filter((v) => v.sku !== baseVariant.sku);
    const results: Array<{ sku: string; color: string; itemId?: string; error?: string }> = [];

    for (const variant of otherVariants) {
      const colorValueId = resolveColorValueId(variant.color!);
      if (!colorValueId) {
        results.push({ sku: variant.sku, color: variant.color!, error: 'cor não encontrada na lista da categoria' });
        continue;
      }
      const imageUrl = variant.imageUrl && /^https?:\/\//.test(variant.imageUrl) ? variant.imageUrl : product.imageUrl;
      if (!imageUrl || !/^https?:\/\//.test(imageUrl)) {
        results.push({ sku: variant.sku, color: variant.color!, error: 'sem foto pública (própria nem de capa)' });
        continue;
      }

      const payload = {
        category_id: categoryId,
        price: priceFor(variant),
        currency_id: 'BRL',
        // Estoque real, inclusive 0 — produto sem estoque nessa cor aparece esgotado, nunca
        // omitido do anúncio (decisão explícita do usuário).
        available_quantity: Math.max(variant.inventory.available, 0),
        buying_mode: 'buy_it_now' as const,
        condition: 'new' as const,
        listing_type_id: listingTypeId,
        family_name: familyName,
        pictures: [{ source: imageUrl }],
        attributes: [
          { id: 'BRAND', value_id: brandValue.id },
          { id: 'SELLER_SKU', value_name: variant.sku },
          { id: 'MODEL', value_name: product.baseSku },
          { id: 'COLOR', value_id: colorValueId },
        ],
      };

      try {
        const created = await client.createItem(payload);
        results.push({ sku: variant.sku, color: variant.color!, itemId: created.id });
        console.log(`Criado: ${variant.color} (SKU ${variant.sku}) → ${created.id} (status=${created.status ?? '—'})`);
      } catch (error) {
        const message = error instanceof MercadoLivreApiError ? `${error.message} — ${JSON.stringify(error.rawResponse)}` : String(error);
        results.push({ sku: variant.sku, color: variant.color!, error: message });
        console.error(`Falha ao criar ${variant.color} (SKU ${variant.sku}): ${message}`);
      }
    }

    console.log('----------------------------------------------------');
    console.log('Resumo:');
    console.log(`  Base: ${mlItemId} — ${baseVariant.color} (SKU ${baseVariant.sku})`);
    for (const r of results) {
      console.log(`  ${r.itemId ? 'OK  ' : 'FALHA'} ${r.color} (SKU ${r.sku}) — ${r.itemId ?? r.error}`);
    }
    console.log('----------------------------------------------------');
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
