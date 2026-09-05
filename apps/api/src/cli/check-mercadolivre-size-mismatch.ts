/* eslint-disable no-console */
/**
 * Diagnóstico (somente leitura) pra decidir, dos produtos já publicados no Mercado Livre antes da
 * correção de agrupamento por tamanho, quais precisam ser reconstruídos.
 *
 * Contexto: a versão do `MercadoLivreProductsSyncService` que publicou o primeiro lote de produtos
 * não tinha nenhuma noção de tamanho — todas as cores de um produto, mesmo de tamanhos diferentes,
 * viravam itens dentro da MESMA família (`family_name`). A correção atual separa por tamanho antes
 * de separar por cor, mas isso só vale pra publicações NOVAS — o que já existe no Mercado Livre
 * continua com a estrutura antiga até ser recriado.
 *
 * Este script lista, entre os produtos com `ChannelProductMapping` confirmado, quais têm variantes
 * ACTIVE com mais de um valor de `size` — esses são os candidatos a reconstrução (encerrar os itens
 * já publicados e deixar o scheduler corrigido recriar, já separado por tamanho). Produtos que só
 * variam por cor (um único tamanho, ou nenhum) não aparecem aqui — pra esses a própria sincronização
 * automática já publica sozinha as cores que faltaram, na família já existente.
 *
 * Nunca fecha, apaga ou modifica nada — só lista, pra decidirmos juntos o que reconstruir.
 *
 * Uso:
 *   npm run check-mercadolivre-size-mismatch --workspace=@ecommerce-manager/api
 */
import { PrismaClient } from '@ecommerce-manager/database';

async function main() {
  const prisma = new PrismaClient();
  try {
    const company = await prisma.company.findFirst();
    if (!company) {
      console.error('Nenhuma empresa encontrada.');
      process.exitCode = 1;
      return;
    }

    const mappings = await prisma.channelProductMapping.findMany({
      where: {
        channel: { companyId: company.id },
        variantId: { not: null },
        externalProductId: { not: null },
      },
      include: {
        variant: { include: { product: true } },
      },
    });

    if (mappings.length === 0) {
      console.log('Nenhum produto com vínculo confirmado no Mercado Livre ainda.');
      return;
    }

    type MappedEntry = { sku: string; size: string | null; itemId: string };
    type ProductInfo = { name: string; entries: MappedEntry[] };

    const byProduct = new Map<string, ProductInfo>();
    for (const m of mappings) {
      const variant = m.variant;
      if (!variant) continue;
      const product = variant.product;
      const entry = byProduct.get(product.id) ?? { name: product.name, entries: [] };
      entry.entries.push({ sku: variant.sku, size: variant.size, itemId: m.externalProductId! });
      byProduct.set(product.id, entry);
    }

    const mismatched: Array<{ productId: string; name: string; sizes: string[]; entries: MappedEntry[] }> = [];
    for (const [productId, info] of byProduct) {
      const sizes = new Set(info.entries.map((e) => e.size ?? '(sem tamanho)'));
      if (sizes.size > 1) {
        mismatched.push({ productId, name: info.name, sizes: [...sizes], entries: info.entries });
      }
    }

    console.log(`Total de produtos publicados no Mercado Livre: ${byProduct.size}.`);
    console.log(`Produtos com mais de um tamanho misturado na mesma família: ${mismatched.length}.`);
    console.log('======================================================');
    for (const p of mismatched) {
      console.log(`Produto: ${p.name} (${p.productId})`);
      console.log(`  Tamanhos misturados: ${p.sizes.join(', ')}`);
      for (const e of p.entries) {
        console.log(`    SKU ${e.sku} — tamanho ${e.size ?? '(sem tamanho)'} — item ${e.itemId}`);
      }
    }
    if (mismatched.length === 0) {
      console.log('Nenhum produto precisa ser reconstruído por causa de tamanho.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
