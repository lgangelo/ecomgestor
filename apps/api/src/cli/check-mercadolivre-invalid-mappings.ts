/* eslint-disable no-console */
/**
 * Diagnóstico (somente leitura) pra achar vínculos (`ChannelProductMapping`) do Mercado Livre que
 * apontam pra um item que NÃO EXISTE MAIS (ou nunca existiu) na API real — achado real do usuário:
 * um item antigo no catálogo (`1736498962657084740`) supostamente com várias cores no mesmo
 * anúncio devolveu 404 ao consultar `GET /items/{id}` de verdade. Ou seja, nunca houve variações
 * agrupadas de verdade nesta conta — esse vínculo é dado inválido/órfão, provavelmente de uma fase
 * anterior a esta automação (o formato do id, só números sem prefixo "MLB", não bate com o formato
 * real de item do Mercado Livre — mais parece um id numérico de outro canal, ex. TikTok).
 *
 * Confere CADA vínculo confirmado chamando `getItem` de verdade — se vier 404 (ou qualquer erro
 * PERMANENT indicando que o item não existe), marca como inválido. Nunca apaga nada sozinho.
 *
 * Modo diagnóstico (padrão): só lista os vínculos inválidos encontrados.
 * Modo --confirm: remove do banco só os vínculos confirmados como inválidos (nunca mexe no
 * Mercado Livre — o "item" nem existe lá pra ter o que apagar).
 *
 * Uso:
 *   npm run check-mercadolivre-invalid-mappings --workspace=@ecommerce-manager/api
 *   npm run check-mercadolivre-invalid-mappings --workspace=@ecommerce-manager/api -- --confirm
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient, ChannelType } from '@ecommerce-manager/database';
import { MercadoLivreApiError } from '@ecommerce-manager/integrations';
import { AppModule } from '../app.module';
import { MercadoLivreConnectorFactory } from '../integrations/mercadolivre/mercadolivre-connector.factory';

async function main() {
  const confirm = process.argv.includes('--confirm');

  const prisma = new PrismaClient();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const company = await prisma.company.findFirst();
    if (!company) {
      console.error('Nenhuma empresa encontrada.');
      process.exitCode = 1;
      return;
    }

    const channels = await prisma.salesChannel.findMany({ where: { companyId: company.id, type: ChannelType.MERCADO_LIVRE } });
    if (channels.length > 1) {
      console.log(`AVISO: ${channels.length} canais Mercado Livre encontrados pra esta empresa (esperado 1) — conferindo todos.`);
    }
    if (channels.length === 0) {
      console.log('Nenhum canal Mercado Livre encontrado.');
      return;
    }

    const connectorFactory = app.get(MercadoLivreConnectorFactory);
    const { client } = await connectorFactory.forCompany(company.id);

    const mappings = await prisma.channelProductMapping.findMany({
      where: { channelId: { in: channels.map((c) => c.id) }, variantId: { not: null }, externalProductId: { not: null } },
      include: { variant: { include: { product: true } } },
    });
    console.log(`Total de vínculos a conferir: ${mappings.length}.`);

    const invalid: typeof mappings = [];
    for (const mapping of mappings) {
      try {
        await client.getItem(mapping.externalProductId!);
      } catch (error) {
        if (error instanceof MercadoLivreApiError && error.statusCode === 404) {
          invalid.push(mapping);
        } else {
          console.log(`  Erro ao conferir ${mapping.externalProductId} (não necessariamente inválido, ver mensagem): ${error instanceof Error ? error.message : error}`);
        }
      }
    }

    console.log('======================================================');
    console.log(`Vínculos inválidos (item não existe no Mercado Livre): ${invalid.length}.`);
    for (const m of invalid) {
      console.log(`  channel ${m.channelId} | item ${m.externalProductId} | produto "${m.variant?.product.name ?? '?'}" | variante ${m.variant?.sku ?? '?'}`);
    }

    if (invalid.length === 0) {
      console.log('Nada a limpar.');
      return;
    }

    if (!confirm) {
      console.log('Modo DIAGNÓSTICO — nada foi removido. Rode de novo com --confirm pra remover de fato.');
      return;
    }

    for (const m of invalid) {
      await prisma.channelProductMapping.delete({ where: { id: m.id } });
    }
    console.log(`Removidos: ${invalid.length} vínculo(s) inválido(s).`);
  } finally {
    await prisma.$disconnect();
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
