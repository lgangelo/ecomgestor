/* eslint-disable no-console */
/**
 * Acha o ID do anúncio na Mercado Livre (`MLB...`) a partir do SKU — pedido do usuário: nenhuma
 * tela mostra isso direto, e vários scripts de diagnóstico (ex.: `check-mercadolivre-item-update`)
 * exigem esse ID pra testar contra um item real. Só leitura, nunca altera nada.
 *
 * Uso:
 *   npm run check-mercadolivre-item-id --workspace=@ecommerce-manager/api -- <SKU>
 */
import { PrismaClient, ChannelType } from '@ecommerce-manager/database';

async function main() {
  const sku = process.argv[2];
  if (!sku) {
    console.error('Uso: npm run check-mercadolivre-item-id --workspace=@ecommerce-manager/api -- <SKU>');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const company = await prisma.company.findFirst();
    if (!company) {
      console.error('Nenhuma empresa encontrada.');
      process.exitCode = 1;
      return;
    }

    const variant = await prisma.productVariant.findFirst({
      where: { sku, product: { companyId: company.id } },
      include: {
        product: { select: { name: true } },
        channelMappings: { include: { channel: { select: { type: true, name: true } } } },
      },
    });
    if (!variant) {
      console.error(`Nenhuma variação encontrada com o SKU "${sku}".`);
      process.exitCode = 1;
      return;
    }

    console.log(`Produto: ${variant.product.name} — SKU: ${variant.sku}`);
    const mlMapping = variant.channelMappings.find((m) => m.channel.type === ChannelType.MERCADO_LIVRE);
    if (!mlMapping || !mlMapping.externalProductId) {
      console.log('Ainda não publicado no Mercado Livre (sem vínculo gravado).');
    } else {
      console.log(`Mercado Livre: item_id = ${mlMapping.externalProductId} (status do vínculo: ${mlMapping.syncStatus})`);
    }
    const tiktokMapping = variant.channelMappings.find((m) => m.channel.type === ChannelType.TIKTOK_SHOP);
    if (tiktokMapping?.externalProductId) {
      console.log(`TikTok Shop: product_id = ${tiktokMapping.externalProductId} (status do vínculo: ${tiktokMapping.syncStatus})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
