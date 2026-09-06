/* eslint-disable no-console */
/**
 * Diagnóstico (somente leitura) — achado real: Mercado Livre rejeitou a descrição de um produto
 * com "item.description.type.invalid" ("The description must be in plain text"), apontando os
 * caracteres nas posições 0 e 26 como inválidos. Imprime a descrição bruta via JSON.stringify
 * (escapa qualquer caractere de controle/HTML/emoji de forma visível) e destaca os caracteres
 * exatos numa posição, pra confirmar com certeza o que está causando a rejeição, em vez de
 * adivinhar.
 *
 * Uso:
 *   npm run check-product-description --workspace=@ecommerce-manager/api -- "pedaço do nome do produto"
 */
import { PrismaClient } from '@ecommerce-manager/database';

async function main() {
  const query = process.argv[2];
  if (!query) {
    console.error('Uso: check-product-description -- "pedaço do nome do produto"');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const products = await prisma.product.findMany({
      where: { name: { contains: query, mode: 'insensitive' } },
      select: { id: true, name: true, description: true },
    });

    if (products.length === 0) {
      console.log(`Nenhum produto encontrado com "${query}" no nome.`);
      return;
    }

    for (const product of products) {
      console.log('======================================================');
      console.log(`Produto: ${product.name} (${product.id})`);
      if (!product.description) {
        console.log('  (sem descrição cadastrada)');
        continue;
      }
      console.log(`  Tamanho: ${product.description.length} caracteres`);
      console.log(`  JSON.stringify (mostra qualquer caractere de controle/HTML/emoji escondido):`);
      console.log(`    ${JSON.stringify(product.description)}`);
      console.log('  Caracteres nas posições que o Mercado Livre reclamou (0 e 26, se existirem):');
      for (const pos of [0, 26]) {
        const ch = product.description[pos];
        if (ch === undefined) continue;
        console.log(`    posição ${pos}: ${JSON.stringify(ch)} (código Unicode ${ch.codePointAt(0)})`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
