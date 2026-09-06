/* eslint-disable no-console */
/**
 * Lista/define o mapeamento categoria local → categoria REAL de um canal externo
 * (`CategoryChannelMapping`) — pré-requisito pra publicar produto automaticamente na TikTok Shop
 * (a TikTok, ao contrário do Mercado Livre, não tem uma API confirmada de "prever categoria pelo
 * título"; a categoria certa precisa ser descoberta uma vez, via `check-tiktok-categories.ts`
 * contra a conta real, e configurada aqui). Sem esse mapeamento configurado, produtos daquela
 * categoria local simplesmente não são publicados (falha visível, nunca adivinha).
 *
 * Uso:
 *   npm run set-category-channel-mapping --workspace=@ecommerce-manager/api
 *     # lista as categorias locais e o mapeamento TIKTOK_SHOP de cada uma (ou "não configurado")
 *   npm run set-category-channel-mapping --workspace=@ecommerce-manager/api -- <categoryId> <externalCategoryId> [categoryVersion]
 *     # define/atualiza o mapeamento pra TIKTOK_SHOP dessa categoria local
 */
import { ChannelType, PrismaClient } from '@ecommerce-manager/database';

async function main() {
  const [categoryId, externalCategoryId, categoryVersion] = process.argv.slice(2);

  const prisma = new PrismaClient();
  try {
    const company = await prisma.company.findFirst();
    if (!company) {
      console.error('Nenhuma empresa encontrada.');
      process.exitCode = 1;
      return;
    }

    if (!categoryId) {
      const categories = await prisma.category.findMany({
        where: { companyId: company.id },
        include: { channelMappings: { where: { channelType: ChannelType.TIKTOK_SHOP } } },
        orderBy: { name: 'asc' },
      });
      console.log('Categorias locais e mapeamento TikTok Shop:');
      console.log('----------------------------------------------------');
      for (const category of categories) {
        const mapping = category.channelMappings[0];
        const status = mapping
          ? `→ categoria TikTok Shop "${mapping.externalCategoryId}"${mapping.externalCategoryVersion ? ` (${mapping.externalCategoryVersion})` : ''}`
          : '→ NÃO CONFIGURADO — produtos desta categoria não serão publicados na TikTok Shop';
        console.log(`  ${category.name} (${category.id}) ${status}`);
      }
      console.log('----------------------------------------------------');
      console.log(
        'Pra definir: npm run set-category-channel-mapping -- <categoryId> <externalCategoryId> [categoryVersion]',
      );
      return;
    }

    if (!externalCategoryId) {
      console.error('Uso: npm run set-category-channel-mapping -- <categoryId> <externalCategoryId> [categoryVersion]');
      process.exitCode = 1;
      return;
    }

    const category = await prisma.category.findFirst({ where: { id: categoryId, companyId: company.id } });
    if (!category) {
      console.error(`Categoria "${categoryId}" não encontrada.`);
      process.exitCode = 1;
      return;
    }

    await prisma.categoryChannelMapping.upsert({
      where: { categoryId_channelType: { categoryId, channelType: ChannelType.TIKTOK_SHOP } },
      create: {
        companyId: company.id,
        categoryId,
        channelType: ChannelType.TIKTOK_SHOP,
        externalCategoryId,
        externalCategoryVersion: categoryVersion ?? null,
      },
      update: { externalCategoryId, externalCategoryVersion: categoryVersion ?? null },
    });
    console.log(`Mapeamento salvo: categoria "${category.name}" → TikTok Shop "${externalCategoryId}"${categoryVersion ? ` (${categoryVersion})` : ''}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
