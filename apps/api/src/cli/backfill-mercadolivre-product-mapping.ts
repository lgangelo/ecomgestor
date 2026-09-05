/* eslint-disable no-console */
/**
 * Backfill de `ChannelProductMapping` (Bloco 3, item 6 do plano) — os produtos publicados
 * manualmente antes desta etapa (via `publish-mercadolivre-item.ts`/`add-mercadolivre-variations.ts`)
 * nunca tiveram o vínculo produto↔anúncio gravado no banco, então o outbox de estoque e a nova
 * sincronização automática de catálogo não conseguem "enxergar" o que já existe no Mercado Livre.
 *
 * HONESTIDADE: `GET /users/{seller_id}/items/search` (listar itens do vendedor) NUNCA foi
 * confirmado contra uma chamada real nesta sessão — só os métodos já confirmados do
 * `MercadoLivreClient` foram exercitados até agora. Por isso este script SEMPRE começa em modo
 * diagnóstico (busca só a primeira página e imprime a resposta bruta) — só varre tudo e grava o
 * vínculo quando chamado com `--confirm`, depois de você revisar o formato real da resposta.
 *
 * Casamento: pra cada item, lê o atributo SELLER_SKU e casa com `ProductVariant.sku` (da empresa).
 * Item sem SELLER_SKU ou sem SKU correspondente nunca vira um vínculo inventado — fica listado
 * como "não casado" pra decisão manual.
 *
 * Uso:
 *   npm run backfill-mercadolivre-product-mapping --workspace=@ecommerce-manager/api            # diagnóstico (só 1ª página)
 *   npm run backfill-mercadolivre-product-mapping --workspace=@ecommerce-manager/api -- --confirm # varre tudo e grava
 */
import { NestFactory } from '@nestjs/core';
import { ChannelMappingSyncStatus, PrismaClient } from '@ecommerce-manager/database';
import { MercadoLivreApiError } from '@ecommerce-manager/integrations';
import { AppModule } from '../app.module';
import { MercadoLivreConnectorFactory } from '../integrations/mercadolivre/mercadolivre-connector.factory';
import { MercadoLivreCredentialsService } from '../integrations/mercadolivre/mercadolivre-credentials.service';

const PAGE_SIZE = 50;
const MAX_PAGES = 40; // teto de segurança (até 2000 itens) — nunca um laço sem fim.

async function main() {
  const confirm = process.argv.includes('--confirm');

  const prisma = new PrismaClient();
  const company = await prisma.company.findFirst();
  if (!company) {
    console.error('Nenhuma empresa encontrada.');
    process.exitCode = 1;
    await prisma.$disconnect();
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const connectorFactory = app.get(MercadoLivreConnectorFactory);
    const credentialsService = app.get(MercadoLivreCredentialsService);
    const { client, integrationId } = await connectorFactory.forCompany(company.id);
    const integration = await credentialsService.requireIntegration(company.id);
    if (!integration.channelId) {
      console.error('Canal Mercado Livre ainda não conectado.');
      process.exitCode = 1;
      return;
    }
    const credentials = await credentialsService.getCredentials(integrationId);
    if (!credentials) {
      console.error('Credenciais Mercado Livre não encontradas.');
      process.exitCode = 1;
      return;
    }

    console.log(`Buscando itens do vendedor ${credentials.userId}...`);
    const firstPage = await client.request<Record<string, unknown>>('GET', `/users/${credentials.userId}/items/search`, {
      query: { limit: String(PAGE_SIZE), offset: '0' },
    });
    console.log('======================================================');
    console.log('Resposta bruta da primeira página (NUNCA confirmada antes desta chamada):');
    console.log(JSON.stringify(firstPage, null, 2));
    console.log('======================================================');

    const results = (firstPage as { results?: unknown }).results;
    if (!Array.isArray(results)) {
      console.error(
        'A resposta não trouxe um array em `results` como esperado — formato diferente do previsto. ' +
          'Pare aqui e revise o payload acima antes de tentar de novo.',
      );
      process.exitCode = 1;
      return;
    }

    if (!confirm) {
      console.log(`Modo DIAGNÓSTICO — ${results.length} item(ns) na primeira página. Rode de novo com --confirm pra varrer tudo e gravar.`);
      return;
    }

    const paging = (firstPage as { paging?: { total?: number } }).paging;
    const total = paging?.total ?? results.length;
    console.log(`Modo CONFIRMAÇÃO — total reportado: ${total} item(ns).`);

    const allItemIds: string[] = [...results.map(String)];
    for (let page = 1; page < MAX_PAGES && allItemIds.length < total; page++) {
      const offset = page * PAGE_SIZE;
      const next = await client.request<Record<string, unknown>>('GET', `/users/${credentials.userId}/items/search`, {
        query: { limit: String(PAGE_SIZE), offset: String(offset) },
      });
      const nextResults = (next as { results?: unknown }).results;
      if (!Array.isArray(nextResults) || nextResults.length === 0) break;
      allItemIds.push(...nextResults.map(String));
    }
    console.log(`Total de ids coletados: ${allItemIds.length}.`);

    let matched = 0;
    let alreadyMapped = 0;
    const unmatched: Array<{ itemId: string; sellerSku?: string; reason: string }> = [];

    for (const itemId of allItemIds) {
      try {
        const item = await client.getItem(itemId);
        const attributes = (item as { attributes?: Array<{ id: string; value_name?: string }> }).attributes ?? [];
        const sellerSku = attributes.find((a) => a.id === 'SELLER_SKU')?.value_name;
        if (!sellerSku) {
          unmatched.push({ itemId, reason: 'sem atributo SELLER_SKU' });
          continue;
        }

        const variant = await prisma.productVariant.findFirst({
          where: { sku: sellerSku, product: { companyId: company.id } },
        });
        if (!variant) {
          unmatched.push({ itemId, sellerSku, reason: 'nenhuma variante interna com este SKU' });
          continue;
        }

        const existing = await prisma.channelProductMapping.findUnique({
          where: { channelId_variantId: { channelId: integration.channelId, variantId: variant.id } },
        });
        if (existing?.externalProductId === itemId) {
          alreadyMapped++;
          continue;
        }

        await prisma.channelProductMapping.upsert({
          where: { channelId_variantId: { channelId: integration.channelId, variantId: variant.id } },
          create: {
            channelId: integration.channelId,
            variantId: variant.id,
            externalProductId: itemId,
            externalSku: sellerSku,
            syncStatus: ChannelMappingSyncStatus.CONFIRMED,
          },
          update: { externalProductId: itemId, externalSku: sellerSku, syncStatus: ChannelMappingSyncStatus.CONFIRMED },
        });
        matched++;
        console.log(`  OK: item ${itemId} (SKU ${sellerSku}) → variante ${variant.id}`);
      } catch (error) {
        const message = error instanceof MercadoLivreApiError ? error.message : String(error);
        unmatched.push({ itemId, reason: `erro ao ler item: ${message}` });
      }
    }

    console.log('======================================================');
    console.log(`Resumo: ${matched} vínculo(s) novo(s), ${alreadyMapped} já estavam corretos, ${unmatched.length} não casado(s).`);
    if (unmatched.length > 0) {
      console.log('Não casados (revisão manual):');
      for (const u of unmatched) {
        console.log(`  ${u.itemId}${u.sellerSku ? ` (SKU ${u.sellerSku})` : ''} — ${u.reason}`);
      }
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
    await prisma.$disconnect();
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
