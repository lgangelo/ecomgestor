/* eslint-disable no-console */
/**
 * Diagnóstico (somente leitura) — quantifica quantos produtos têm descrição "suja" antes de
 * decidir como corrigir em massa (pedido do usuário, achado real do caso Fy8714-2-2: descrição
 * importada do TikTok com tags HTML, emoji em excesso, hashtags e até um <img> embutido). Nunca
 * corrige nada aqui — só lista pra confirmar o tamanho real do problema com dado real, antes de
 * qualquer regeneração em massa.
 *
 * Classificação (um produto pode cair em mais de uma):
 *   - "html": contém alguma tag (`<...>`), ex.: `<p>`, `<span>`, `<br>`, `<img>`.
 *   - "curta": descrição com menos de 100 caracteres depois de remover HTML — indício de texto
 *     genérico/pouco elaborado (ex.: "Bolsa quadrada feminina", 30 caracteres).
 *   - "sem_descricao": produto ativo sem nenhuma descrição cadastrada.
 *
 * Uso:
 *   npm run check-product-description-quality --workspace=@ecommerce-manager/api
 *   npm run check-product-description-quality --workspace=@ecommerce-manager/api -- --all (inclui inativos)
 */
import { PrismaClient } from '@ecommerce-manager/database';

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function main() {
  const includeInactive = process.argv.includes('--all');
  const prisma = new PrismaClient();
  try {
    const products = await prisma.product.findMany({
      where: includeInactive ? {} : { status: 'ACTIVE' },
      select: { id: true, name: true, baseSku: true, description: true },
      orderBy: { createdAt: 'desc' },
    });

    const withHtml: typeof products = [];
    const short: typeof products = [];
    const missing: typeof products = [];

    for (const product of products) {
      if (!product.description) {
        missing.push(product);
        continue;
      }
      if (/<[^>]+>/.test(product.description)) withHtml.push(product);
      if (stripHtml(product.description).length < 100) short.push(product);
    }

    console.log(`Total de produtos analisados: ${products.length} (${includeInactive ? 'todos os status' : 'só ACTIVE'})`);
    console.log('======================================================');
    console.log(`Com HTML na descrição (precisa ser reenviado como texto plano, risco de falha no Mercado Livre): ${withHtml.length}`);
    for (const p of withHtml) console.log(`  - ${p.baseSku} — ${p.name}`);
    console.log('======================================================');
    console.log(`Descrição curta/genérica (< 100 caracteres sem HTML): ${short.length}`);
    for (const p of short) console.log(`  - ${p.baseSku} — ${p.name} (${stripHtml(p.description!).length} caracteres): "${stripHtml(p.description!)}"`);
    console.log('======================================================');
    console.log(`Sem nenhuma descrição cadastrada: ${missing.length}`);
    for (const p of missing) console.log(`  - ${p.baseSku} — ${p.name}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
