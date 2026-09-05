/* eslint-disable no-console */
/**
 * Diagnóstico (somente leitura) — achado do usuário: no mobile, com o filtro "Só com estoque"
 * ligado, a foto de capa dos produtos listados não aparece; desmarcando o filtro, aparece. Antes
 * de mexer em código de novo, confere os dados reais: os produtos que aparecem com o filtro ligado
 * têm `imageUrl` cadastrado ou não?
 *
 * Uso:
 *   npm run check-product-images --workspace=@ecommerce-manager/api                # só com estoque (bate com o filtro padrão da tela)
 *   npm run check-product-images --workspace=@ecommerce-manager/api -- --all       # todos, independente de estoque
 */
import { PrismaClient } from '@ecommerce-manager/database';

async function main() {
  const all = process.argv.includes('--all');

  const prisma = new PrismaClient();
  try {
    const company = await prisma.company.findFirst();
    if (!company) {
      console.error('Nenhuma empresa encontrada.');
      process.exitCode = 1;
      return;
    }

    const products = await prisma.product.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { variants: { include: { inventory: true } } },
    });

    console.log(`Modo: ${all ? 'TODOS os produtos' : 'só com estoque (bate com o filtro padrão da tela)'}`);
    console.log('======================================================');
    let shown = 0;
    for (const product of products) {
      const totalAvailable = product.variants.reduce(
        (sum, v) => sum + (v.inventory ? v.inventory.onHand - v.inventory.reserved : 0),
        0,
      );
      if (!all && totalAvailable <= 0) continue;
      shown++;
      console.log(
        `${product.baseSku} — "${product.name.slice(0, 50)}" — imageUrl: ${product.imageUrl ? product.imageUrl : '(NULO — sem foto cadastrada)'} — estoque total: ${totalAvailable}`,
      );
    }
    console.log('======================================================');
    console.log(`${shown} produto(s) listado(s) (dos 20 mais recentes).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
