/* eslint-disable no-console */
/**
 * Script de CONFIRMAÇÃO MANUAL (Bloco 3, item 5 do plano) — testa, contra 1 item REAL já
 * publicado, tudo que `updateItem`/`setItemDescription` NUNCA foram exercitados nesta sessão
 * como ATUALIZAÇÃO (só a criação de item já foi confirmada antes). Rodar isto (e revisar o
 * resultado junto com o usuário) é o passo que precisa acontecer ANTES de deixar
 * `MERCADOLIVRE_PRODUCTS_SYNC_ENABLED=true` de verdade em produção.
 *
 * Cada teste é OPT-IN via flag — sem flag nenhuma, só imprime o estado atual do item (seguro,
 * só leitura). Isso é DE PROPÓSITO: o teste de `status` (pausar/reativar) mexe na visibilidade
 * pública real do anúncio.
 *
 * CUIDADO: com as flags ligadas, isto altera um anúncio PÚBLICO de verdade (preço, fotos,
 * atributos, e possivelmente pausa/reativa a visibilidade do anúncio).
 *
 * Uso:
 *   npm run check-mercadolivre-item-update --workspace=@ecommerce-manager/api -- <itemId>
 *   npm run check-mercadolivre-item-update --workspace=@ecommerce-manager/api -- <itemId> --test-price
 *   npm run check-mercadolivre-item-update --workspace=@ecommerce-manager/api -- <itemId> --test-pictures
 *   npm run check-mercadolivre-item-update --workspace=@ecommerce-manager/api -- <itemId> --test-attributes
 *   npm run check-mercadolivre-item-update --workspace=@ecommerce-manager/api -- <itemId> --test-description
 *   npm run check-mercadolivre-item-update --workspace=@ecommerce-manager/api -- <itemId> --test-status
 *   (pode combinar várias flags na mesma chamada)
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { MercadoLivreApiError } from '@ecommerce-manager/integrations';
import { AppModule } from '../app.module';
import { MercadoLivreConnectorFactory } from '../integrations/mercadolivre/mercadolivre-connector.factory';

async function main() {
  const itemId = process.argv[2];
  if (!itemId) {
    console.error('Uso: npm run check-mercadolivre-item-update --workspace=@ecommerce-manager/api -- <itemId> [--test-*]');
    process.exitCode = 1;
    return;
  }
  const flags = new Set(process.argv.slice(3));

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

    console.log('======================================================');
    console.log(`Estado atual de ${itemId}:`);
    const before = await client.getItem(itemId);
    console.log(JSON.stringify(before, null, 2));

    if (flags.has('--test-price')) {
      console.log('======================================================');
      console.log('Teste PRICE (reenviando o preço atual, sem alterar de verdade)...');
      const price = (before as { price?: unknown }).price;
      await client.updateItem(itemId, { price });
      const after = await client.getItem(itemId);
      console.log(`price antes=${price} depois=${(after as { price?: unknown }).price}`);
    }

    if (flags.has('--test-pictures')) {
      console.log('======================================================');
      console.log('Teste PICTURES (reenviando as mesmas fotos já existentes)...');
      const pictures = ((before as { pictures?: Array<{ url?: string; secure_url?: string }> }).pictures ?? []).map((p) => ({
        source: p.secure_url ?? p.url,
      }));
      console.log('Payload:', JSON.stringify(pictures, null, 2));
      await client.updateItem(itemId, { pictures });
      const after = await client.getItem(itemId);
      console.log('pictures depois:', JSON.stringify((after as { pictures?: unknown }).pictures, null, 2));
    }

    if (flags.has('--test-attributes')) {
      console.log('======================================================');
      console.log('Teste ATTRIBUTES (reenviando o MODEL atual)...');
      const attributes = (before as { attributes?: Array<{ id: string; value_name?: string }> }).attributes ?? [];
      const model = attributes.find((a) => a.id === 'MODEL');
      if (!model) {
        console.log('Item não tem atributo MODEL — pulando este teste.');
      } else {
        await client.updateItem(itemId, { attributes: [{ id: 'MODEL', value_name: model.value_name }] });
        const after = await client.getItem(itemId);
        const afterModel = ((after as { attributes?: Array<{ id: string; value_name?: string }> }).attributes ?? []).find(
          (a) => a.id === 'MODEL',
        );
        console.log(`MODEL antes="${model.value_name}" depois="${afterModel?.value_name}"`);
      }
    }

    if (flags.has('--test-description')) {
      console.log('======================================================');
      console.log('Teste DESCRIPTION (chamando setItemDescription duas vezes)...');
      const desc = `Teste de confirmação — ${new Date().toISOString()}`;
      await client.setItemDescription(itemId, desc);
      await client.setItemDescription(itemId, `${desc} (segunda chamada)`);
      console.log('Duas chamadas concluídas sem erro — confirme manualmente no anúncio que sobrescreveu, não duplicou.');
    }

    if (flags.has('--test-status')) {
      console.log('======================================================');
      console.log('CUIDADO — Teste STATUS (pausar e reativar o anúncio de verdade)...');
      const statusBefore = (before as { status?: string }).status;
      console.log(`status antes=${statusBefore}`);
      await client.updateItem(itemId, { status: 'paused' });
      const paused = await client.getItem(itemId);
      console.log(`status depois de pausar=${(paused as { status?: string }).status} — confira manualmente que o anúncio sumiu da busca pública.`);
      await client.updateItem(itemId, { status: 'active' });
      const reactivated = await client.getItem(itemId);
      console.log(`status depois de reativar=${(reactivated as { status?: string }).status} — confira manualmente que o anúncio voltou a aparecer.`);
    }

    console.log('======================================================');
    console.log('Concluído. Revise cada resultado acima com atenção antes de confiar na sincronização automática.');
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
