/* eslint-disable no-console */
/**
 * Primeira tentativa real de criar um anúncio no Mercado Livre a partir de um produto já
 * cadastrado no nosso sistema — script de diagnóstico, não um endpoint de produção: o formato
 * exato do payload de `POST /items` nunca foi confirmado contra uma chamada real (ver
 * docs/integrations/mercado-livre.md, "Próximos passos"). Roda a categoria prevista pelo título,
 * resolve o atributo BRAND pro valor de catálogo "Generic" (decisão do usuário — marca própria
 * "Venticelli" não está na lista fechada de marcas da categoria), MODEL = SKU base, e publica.
 *
 * CUIDADO: isso cria um anúncio PÚBLICO de verdade na conta conectada (não existe sandbox no
 * Mercado Livre) — rodar este script tem efeito real e visível pra qualquer comprador.
 *
 * Uso:
 *   npm run publish-mercadolivre-item --workspace=@ecommerce-manager/api -- <productId>
 */
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@ecommerce-manager/database';
import { MercadoLivreApiError } from '@ecommerce-manager/integrations';
import { AppModule } from '../app.module';
import { ProductsService } from '../products/products.service';
import { MercadoLivreConnectorFactory } from '../integrations/mercadolivre/mercadolivre-connector.factory';

const SITE_ID = 'MLB';
const CURRENCY_ID = 'BRL';
const BRAND_FALLBACK_NAME = 'Generic';
// CONFIRMADO em produção (erro real "body.required_fields" sem isso): pra Marketplace (não
// Mercado Shops), os tipos disponíveis são free/gold_special/gold_pro — "Clássico" é o padrão
// mais comum entre esses três; usado só como preferência, o script sempre confirma contra a
// lista real da conta (`getListingTypes`) antes de usar.
const PREFERRED_LISTING_TYPE_ID = 'gold_special';

async function main() {
  const productId = process.argv[2];
  if (!productId) {
    console.error('Uso: npm run publish-mercadolivre-item --workspace=@ecommerce-manager/api -- <productId>');
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

    const product = await productsService.findOne(productId, company.id);
    const variant = product.variants[0];
    if (!variant) {
      console.error('Produto sem nenhuma variação — não há SKU/preço/estoque pra publicar.');
      process.exitCode = 1;
      return;
    }
    if (!product.imageUrl || !/^https?:\/\//.test(product.imageUrl)) {
      console.error('Produto sem foto pública (URL http/https) — o Mercado Livre precisa de uma URL acessível.');
      process.exitCode = 1;
      return;
    }

    const { client } = await connectorFactory.forCompany(company.id);

    console.log(`Prevendo categoria pro título "${product.name}"...`);
    const predictions = await client.predictCategory(SITE_ID, product.name, 1);
    const categoryId = predictions[0]?.category_id;
    if (!categoryId) {
      console.error('Nenhuma categoria sugerida pro título deste produto.');
      process.exitCode = 1;
      return;
    }
    console.log(`Categoria: ${categoryId} (${predictions[0]?.category_name})`);

    const listingTypes = await client.getListingTypes(SITE_ID);
    const listingType = listingTypes.find((t) => t.id === PREFERRED_LISTING_TYPE_ID) ?? listingTypes[0];
    if (!listingType) {
      console.error(`Nenhum tipo de publicação disponível pro site ${SITE_ID}.`);
      process.exitCode = 1;
      return;
    }
    console.log(`Tipo de publicação: ${listingType.id} (${listingType.name})`);

    const categoryAttributes = await client.getCategoryAttributes(categoryId);
    const brandAttribute = categoryAttributes.find((a) => a.id === 'BRAND');
    const brandValue = brandAttribute?.values?.find((v) => v.name.toLowerCase() === BRAND_FALLBACK_NAME.toLowerCase());
    if (!brandValue) {
      console.error(`Não encontrei o valor de catálogo "${BRAND_FALLBACK_NAME}" pra BRAND nesta categoria.`);
      process.exitCode = 1;
      return;
    }

    const title = product.name.length > 60 ? product.name.slice(0, 60) : product.name;
    // Markup só no preço PUBLICADO no Mercado Livre — a taxa de lá é mais alta que a da TikTok,
    // então o preço precisa de uma margem a mais aqui pra manter o mesmo lucro líquido. Nunca
    // altera o preço interno (variant.suggestedPrice continua intocado no nosso banco).
    const basePrice = Number(variant.suggestedPrice);
    const publishedPrice = Math.round(basePrice * (1 + priceMarkupPercent / 100) * 100) / 100;
    if (priceMarkupPercent > 0) {
      console.log(`Preço base: R$ ${basePrice.toFixed(2)} — com markup de ${priceMarkupPercent}%: R$ ${publishedPrice.toFixed(2)}`);
    }
    const payload = {
      // CONFIRMADO em produção: nunca enviar `title` junto com `family_name` — o Mercado Livre
      // recusa ("body.invalid_fields") e gera o título sozinho a partir dos atributos/família.
      category_id: categoryId,
      price: publishedPrice,
      currency_id: CURRENCY_ID,
      available_quantity: Math.max(variant.inventory.available, 1),
      buying_mode: 'buy_it_now' as const,
      condition: 'new' as const,
      listing_type_id: listingType.id,
      family_name: title,
      pictures: [{ source: product.imageUrl }],
      attributes: [
        { id: 'BRAND', value_id: brandValue.id },
        // SELLER_SKU (opcional, mas confirmado disponível na ficha da categoria) — grava o
        // NOSSO SKU interno no anúncio, essencial pra reidentificar depois qual variação
        // interna corresponde a este item quando a sincronização de pedidos/estoque existir.
        { id: 'SELLER_SKU', value_name: variant.sku },
        { id: 'MODEL', value_name: product.baseSku },
      ],
    };

    console.log('----------------------------------------------------');
    console.log('Payload que será enviado:');
    console.log(JSON.stringify(payload, null, 2));
    console.log('----------------------------------------------------');

    const created = await client.createItem(payload);
    console.log(`Item criado: id=${created.id} status=${created.status ?? '—'} permalink=${created.permalink ?? '—'}`);

    if (product.description) {
      await client.setItemDescription(created.id, product.description);
      console.log('Descrição enviada com sucesso.');
    }
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
