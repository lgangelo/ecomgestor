/* eslint-disable no-console */
/**
 * Diagnóstico (somente leitura) — achado real: Mercado Livre rejeitou a descrição de um produto
 * com "item.description.type.invalid" ("The description must be in plain text"). Imprime a
 * descrição bruta via JSON.stringify (escapa qualquer caractere de controle/HTML/emoji de forma
 * visível), e também simula a limpeza que `trySetDescription` já aplica hoje
 * (`stripHtmlForPlainText`, em mercadolivre-products-sync.service.ts) — mostra se ainda sobra
 * alguma tag/emoji/seletor de variação depois de limpar, pra confirmar com certeza se o problema
 * é a mesma causa já corrigida (deploy pendente) ou uma causa NOVA que a limpeza atual não cobre.
 *
 * IMPORTANTE: a função abaixo é uma CÓPIA da de `mercadolivre-products-sync.service.ts` (esse
 * arquivo compila fora do Nest, sem acesso ao módulo) — sempre que a de lá mudar, atualizar aqui
 * também, senão este diagnóstico mostra um resultado desatualizado (já aconteceu uma vez: esta
 * cópia ficou sem a remoção de emoji por uma rodada inteira, escondendo a causa real).
 *
 * Uso:
 *   npm run check-product-description --workspace=@ecommerce-manager/api -- "pedaço do nome do produto"
 *   npm run check-product-description --workspace=@ecommerce-manager/api -- <variantId ou productId, UUID>
 */
import { PrismaClient } from '@ecommerce-manager/database';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cópia fiel de `stripHtmlForPlainText` (mercadolivre-products-sync.service.ts) — ver aviso acima.
function stripHtmlForPlainText(text: string): string {
  return text
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[\p{Extended_Pictographic}\p{Variation_Selector}]/gu, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function main() {
  const query = process.argv[2];
  if (!query) {
    console.error('Uso: check-product-description -- "pedaço do nome do produto" (ou um variantId/productId, UUID)');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    let products: Array<{ id: string; name: string; description: string | null }>;

    if (UUID_PATTERN.test(query)) {
      const variant = await prisma.productVariant.findUnique({ where: { id: query }, include: { product: true } });
      const product = variant?.product ?? (await prisma.product.findUnique({ where: { id: query } }));
      products = product ? [product] : [];
      if (variant) console.log(`(UUID casou com a variante ${variant.sku} — mostrando o produto dela)`);
      else if (products.length) console.log('(UUID casou direto com um productId)');
    } else {
      products = await prisma.product.findMany({
        where: { name: { contains: query, mode: 'insensitive' } },
        select: { id: true, name: true, description: true },
      });
    }

    if (products.length === 0) {
      console.log(`Nenhum produto encontrado pra "${query}".`);
      return;
    }

    for (const product of products) {
      console.log('======================================================');
      console.log(`Produto: ${product.name} (${product.id})`);
      if (!product.description) {
        console.log('  (sem descrição cadastrada)');
        continue;
      }
      console.log(`  Tamanho bruto: ${product.description.length} caracteres`);
      console.log('  JSON.stringify (mostra qualquer caractere de controle/HTML/emoji escondido):');
      console.log(`    ${JSON.stringify(product.description)}`);

      const stripped = stripHtmlForPlainText(product.description);
      const problems: string[] = [];
      if (/<[^>]+>/.test(stripped)) problems.push('AINDA SOBRA TAG');
      if (/\p{Extended_Pictographic}/u.test(stripped)) problems.push('AINDA SOBRA EMOJI');
      if (/\p{Variation_Selector}/u.test(stripped)) problems.push('AINDA SOBRA SELETOR DE VARIAÇÃO (invisível)');
      console.log(`  Depois de stripHtmlForPlainText (${problems.length ? problems.join(' + ') + ' — bug não coberto pela limpeza atual' : 'limpo'}):`);
      console.log(`    ${JSON.stringify(stripped)}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
