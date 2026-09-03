/* eslint-disable no-console */
/**
 * Corrige o saldo LOCAL (onHand) de uma ou mais variações a partir do saldo real que a própria
 * TikTok reporta agora (`Get Inventory` via `TikTokConnector.getInventory`) — usado quando a
 * entrada de estoque de um produto nunca foi cadastrada no sistema (onHand ficou em 0 pra
 * sempre, sem nenhuma movimentação), travando a baixa automática no envio de pedidos já
 * despachados de verdade ("Saldo insuficiente: estoque físico negativo").
 *
 * Recebe o número do pedido (não o SKU/variantId) pelo mesmo motivo do `check-sku-stock-history`:
 * `skuAtSale` é uma FOTO do momento da venda, então buscar direto pelo pedido sempre acha a
 * variação certa, mesmo que o SKU tenha sido renomeado depois.
 *
 * O ajuste é gravado como `InventoryMovementType.ADJUSTMENT` (auditado, nunca uma escrita
 * silenciosa) via `InventoryLedgerService.adjust` — a mesma porta de entrada única usada por
 * qualquer outra alteração de saldo no sistema (seção 10).
 *
 * Uso:
 *   npm run reconcile-inventory-from-tiktok -- 585794442064397729 585791202687223201
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { TikTokConnectorFactory } from '../integrations/tiktok/tiktok-connector.factory';
import { TikTokCredentialsService } from '../integrations/tiktok/tiktok-credentials.service';
import { InventoryLedgerService } from '../inventory/ledger.service';
import { PrismaService } from '../common/prisma/prisma.service';

async function main() {
  const externalOrderIds = process.argv.slice(2);
  if (externalOrderIds.length === 0) {
    console.error('Uso: npm run reconcile-inventory-from-tiktok -- <externalOrderId1> <externalOrderId2> ...');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();

  const integration = await prisma.integration.findFirst({ where: { provider: 'TIKTOK_SHOP' } });
  if (!integration?.channelId) {
    console.log('Nenhuma integração TikTok conectada.');
    await prisma.$disconnect();
    return;
  }
  const companyId = integration.companyId;
  const channelId = integration.channelId;

  // Resolve pedido -> variantId (a mesma variação pode aparecer em mais de um pedido informado).
  const variantIds = new Set<string>();
  for (const externalOrderId of externalOrderIds) {
    const order = await prisma.order.findFirst({
      where: { externalOrderId },
      include: { items: { select: { variantId: true, productNameAtSale: true } } },
    });
    if (!order) {
      console.log(`Pedido ${externalOrderId}: não encontrado — ignorado.`);
      continue;
    }
    for (const item of order.items) {
      if (item.variantId) variantIds.add(item.variantId);
    }
  }
  if (variantIds.size === 0) {
    console.log('Nenhuma variação vinculada encontrada nos pedidos informados.');
    await prisma.$disconnect();
    return;
  }

  // Vínculo variantId -> externalSku ATUAL (nunca skuAtSale) — mesmo critério do "Comparar estoque".
  const mappings = await prisma.channelProductMapping.findMany({
    where: { channelId, variantId: { in: [...variantIds] }, externalSku: { not: null } },
    include: { variant: { include: { inventory: true, product: { select: { name: true } } } } },
  });
  await prisma.$disconnect();

  if (mappings.length === 0) {
    console.log('Nenhum vínculo (channel_product_mapping) confirmado encontrado para essas variações.');
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const connectorFactory = app.get(TikTokConnectorFactory);
    const credentialsService = app.get(TikTokCredentialsService);
    const ledger = app.get(InventoryLedgerService);
    const prismaService = app.get(PrismaService);
    await credentialsService.requireIntegration(companyId);
    const { connector } = await connectorFactory.forCompany(companyId);

    const externalSkus = mappings.map((m) => m.externalSku!).filter(Boolean);
    const externalInventory = await connector.getInventory(companyId, { externalSkus });
    const externalBySku = new Map(externalInventory.map((e) => [e.externalSku, e.available]));

    for (const mapping of mappings) {
      if (!mapping.variant) continue;
      const v = mapping.variant;
      const tiktokAvailable = externalBySku.get(mapping.externalSku!);
      const currentOnHand = v.inventory?.onHand ?? 0;
      const currentReserved = v.inventory?.reserved ?? 0;

      console.log('----------------------------------------------------');
      console.log(`Variante ${v.sku} (${v.product.name}) — externalSku=${mapping.externalSku}`);
      console.log(`  Saldo local atual: onHand=${currentOnHand} reserved=${currentReserved}`);
      console.log(`  Saldo disponível reportado pela TikTok agora: ${tiktokAvailable ?? '(SKU não retornado pela TikTok)'}`);

      if (tiktokAvailable === undefined) {
        console.log('  Pulado — sem dado da TikTok para comparar.');
        continue;
      }

      // `available = onHand - reserved`; o alvo mantém o `reserved` atual (nenhuma reserva ativa
      // nova sendo criada aqui) e ajusta só o `onHand` pra bater com o disponível real da TikTok.
      const targetOnHand = tiktokAvailable + currentReserved;
      const delta = targetOnHand - currentOnHand;
      if (delta === 0) {
        console.log('  Já está correto — nenhum ajuste necessário.');
        continue;
      }

      await prismaService.client.$transaction(async (tx) => {
        await ledger.adjust(
          tx,
          {
            companyId,
            variantId: v.id,
            referenceType: 'reconciliation',
            referenceId: `reconcile-tiktok-${Date.now()}`,
            reason: 'Correção retroativa: entrada de estoque nunca cadastrada no sistema — saldo alinhado com o disponível reportado pela TikTok agora.',
          },
          delta,
        );
      });
      console.log(`  Ajustado: onHand ${currentOnHand} -> ${targetOnHand} (delta ${delta > 0 ? '+' : ''}${delta}).`);
    }

    console.log('----------------------------------------------------');
    console.log('Concluído. Pedidos travados por saldo insuficiente devem se resolver sozinhos na próxima reconciliação (RECONCILE_ORDERS) ou ao clicar em "Sincronizar com TikTok" na tela do pedido.');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
