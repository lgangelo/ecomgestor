/* eslint-disable no-console */
/**
 * Teste REAL e isolado do mecanismo clássico de variações do Mercado Livre (`variations[]`,
 * SEM `family_name`) — confirmado contra a doc oficial (developers.mercadolivre.com.br/pt_br/
 * como-comecar/variacoes, ver docs/integrations/mercado-livre.md) mas NUNCA exercitado contra
 * uma chamada real nesta conta. Objetivo: descobrir se esse mecanismo agrupa de verdade as
 * cores num único anúncio visível pro comprador — o que `family_name` comprovadamente NÃO faz
 * nesta conta (confirmado direto na página pública de um anúncio real).
 *
 * Cria um item de TESTE isolado (nunca mexe em nenhum produto/anúncio já existente):
 *   1. POST /items com título normal + 1 foto (source: url) — sem `variations` ainda, só pra
 *      conseguir o `id` real atribuído à foto pelo Mercado Livre.
 *   2. Lê o item criado, pega `pictures[0].id`.
 *   3. PUT /items/{id} incluindo `variations` (2 cores, mesma foto, mesmo preço, SELLER_SKU
 *      dentro do `attributes` de cada variação — nunca no nível do item).
 *   4. Imprime o item final + o link público, pra confirmar manualmente no navegador se aparece
 *      um seletor de cor de verdade.
 *
 * Modo diagnóstico (padrão): só resolve categoria/marca/cor e imprime o payload que SERIA
 * enviado — nenhuma chamada de escrita. Modo --confirm: cria o item de teste de verdade.
 *
 * Uso:
 *   npm run check-mercadolivre-real-variations --workspace=@ecommerce-manager/api -- "<título de teste>" <imageUrl> <corA> <skuA> <corB> <skuB>
 *   ... -- --confirm (no final, pra criar de fato)
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { MercadoLivreApiError } from '@ecommerce-manager/integrations';
import { AppModule } from '../app.module';
import { MercadoLivreConnectorFactory } from '../integrations/mercadolivre/mercadolivre-connector.factory';

const SITE_ID = 'MLB';
const CATEGORY_ID = 'MLB7022'; // Bolsas — mesma categoria já confirmada em produção.
const PREFERRED_LISTING_TYPE_ID = 'gold_special';

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--confirm');
  const confirm = process.argv.includes('--confirm');
  const [title, imageUrl, corA, skuA, corB, skuB] = args;
  if (!title || !imageUrl || !corA || !skuA || !corB || !skuB) {
    console.error(
      'Uso: check-mercadolivre-real-variations -- "<título>" <imageUrl> <corA> <skuA> <corB> <skuB> [--confirm]',
    );
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
    const connectorFactory = app.get(MercadoLivreConnectorFactory);
    const { client } = await connectorFactory.forCompany(company.id);

    const listingTypes = await client.getListingTypes(SITE_ID);
    const listingType = listingTypes.find((t) => t.id === PREFERRED_LISTING_TYPE_ID) ?? listingTypes[0];
    if (!listingType) throw new Error('Nenhum tipo de publicação disponível.');

    const attrs = await client.getCategoryAttributes(CATEGORY_ID);
    const brandValueId = attrs.find((a) => a.id === 'BRAND')?.values?.find((v) => v.name.toLowerCase() === 'generic')?.id;
    if (!brandValueId) throw new Error('Valor "Generic" pra BRAND não encontrado.');
    const colorAttr = attrs.find((a) => a.id === 'COLOR');
    const colorAValue = colorAttr?.values?.find((v) => v.name.toLowerCase() === corA.toLowerCase());
    const colorBValue = colorAttr?.values?.find((v) => v.name.toLowerCase() === corB.toLowerCase());
    if (!colorAValue || !colorBValue) {
      throw new Error(`Cor "${corA}" ou "${corB}" não encontrada na lista de valores de COLOR desta categoria.`);
    }

    console.log('======================================================');
    console.log(`Categoria: ${CATEGORY_ID} | listing_type_id: ${listingType.id} | BRAND(Generic): ${brandValueId}`);
    console.log(`Cor A: ${colorAValue.name} (${colorAValue.id}) | Cor B: ${colorBValue.name} (${colorBValue.id})`);

    const basePayload = {
      title,
      category_id: CATEGORY_ID,
      price: 99.9,
      currency_id: 'BRL',
      available_quantity: 2,
      buying_mode: 'buy_it_now' as const,
      condition: 'new' as const,
      listing_type_id: listingType.id,
      pictures: [{ source: imageUrl }],
      attributes: [{ id: 'BRAND', value_id: brandValueId }],
    };

    if (!confirm) {
      console.log('======================================================');
      console.log('Modo DIAGNÓSTICO — payload do passo 1 (criação, sem variations ainda):');
      console.log(JSON.stringify(basePayload, null, 2));
      console.log('Rode de novo com --confirm pra criar o item de teste de verdade.');
      return;
    }

    console.log('======================================================');
    console.log('Passo 1: criando item de teste (sem variations)...');
    const created = await client.createItem(basePayload);
    console.log(`Item criado: ${created.id}`);

    const afterCreate = await client.getItem(created.id);
    const pictureId = (afterCreate.pictures as Array<{ id: string }> | undefined)?.[0]?.id;
    if (!pictureId) throw new Error('Item criado sem nenhuma foto com id atribuído — não dá pra montar picture_ids.');
    console.log(`Foto real atribuída: ${pictureId}`);

    console.log('======================================================');
    console.log('Passo 2: enviando PUT com variations (mecanismo clássico, SEM family_name)...');
    const variationsPayload = {
      variations: [
        {
          attribute_combinations: [{ id: 'COLOR', value_id: colorAValue.id, value_name: colorAValue.name }],
          price: 99.9,
          available_quantity: 1,
          picture_ids: [pictureId],
          attributes: [{ id: 'SELLER_SKU', value_name: skuA }],
        },
        {
          attribute_combinations: [{ id: 'COLOR', value_id: colorBValue.id, value_name: colorBValue.name }],
          price: 99.9,
          available_quantity: 1,
          picture_ids: [pictureId],
          attributes: [{ id: 'SELLER_SKU', value_name: skuB }],
        },
      ],
    };
    console.log(JSON.stringify(variationsPayload, null, 2));
    const updated = await client.updateItem(created.id, variationsPayload);

    console.log('======================================================');
    console.log('Resultado final:');
    console.log(JSON.stringify(updated, null, 2));
    console.log('======================================================');
    console.log(`Link público (confira manualmente se aparece seletor de cor): ${(updated as { permalink?: string }).permalink ?? '(sem permalink na resposta, consulte pelo id)'}`);
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
