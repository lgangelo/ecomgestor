/* eslint-disable no-console */
/**
 * Confirma UMA VEZ (contra a conta real) e GRAVA os atributos de "Get Attributes" pra cada
 * categoria já mapeada pra TikTok Shop (`CategoryChannelMapping.cachedAttributes`).
 *
 * Achado real: essa chamada respondeu diferente pra chamadas IDÊNTICAS byte a byte (mesma
 * categoria "Bolsas"/601445, mesmo shop_cipher, mesma query — só o timestamp mudava) — uma vez
 * "Unexpected identifier... shop_cipher not required" (código 36009004), noutra funcionando
 * perfeitamente. Confirmado intermitente/instável do lado da TikTok, não um bug no nosso request.
 * Como os atributos de uma categoria raramente mudam, e os já confirmados pra "Bolsas" são TODOS
 * opcionais (nenhum `isRequired`), cachear evita depender dessa chamada ao vivo instável em toda
 * publicação — mesmo padrão já usado pro `TIKTOK_DEFAULT_WAREHOUSE_ID` (bypass de API instável).
 *
 * Sem argumento: cacheia só categoria ainda sem cache. Com `--force`: recacheia todas de novo
 * (útil se a TikTok mudar os atributos de uma categoria no futuro).
 *
 * Uso:
 *   npm run cache-tiktok-category-attributes --workspace=@ecommerce-manager/api --
 *   npm run cache-tiktok-category-attributes --workspace=@ecommerce-manager/api -- --force
 */
import { NestFactory } from '@nestjs/core';
import { ChannelType, Prisma, PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { TikTokConnectorFactory } from '../integrations/tiktok/tiktok-connector.factory';

async function main() {
  const force = process.argv.includes('--force');

  const prisma = new PrismaClient();
  try {
    const company = await prisma.company.findFirst();
    if (!company) {
      console.error('Nenhuma empresa encontrada.');
      process.exitCode = 1;
      return;
    }

    const mappings = await prisma.categoryChannelMapping.findMany({
      where: { companyId: company.id, channelType: ChannelType.TIKTOK_SHOP },
      include: { category: { select: { name: true } } },
    });

    const pending = force ? mappings : mappings.filter((m) => m.cachedAttributes == null);
    if (pending.length === 0) {
      console.log('Nenhuma categoria pendente de cache (use --force pra recachear todas de novo).');
      return;
    }

    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    try {
      const connectorFactory = app.get(TikTokConnectorFactory);
      const { connector } = await connectorFactory.forCompany(company.id);

      for (const mapping of pending) {
        console.log(`\n=== ${mapping.category.name} → TikTok Shop "${mapping.externalCategoryId}" ===`);
        try {
          const attrs = await connector.getCategoryAttributes(
            mapping.externalCategoryId,
            mapping.externalCategoryVersion as 'v1' | 'v2' | undefined,
          );
          const requiredCount = attrs.filter((a) => a.isRequired).length;
          console.log(`${attrs.length} atributo(s) confirmado(s), ${requiredCount} obrigatório(s). Salvando cache...`);
          await prisma.categoryChannelMapping.update({
            where: { id: mapping.id },
            data: { cachedAttributes: attrs as unknown as Prisma.InputJsonValue },
          });
          console.log('Cache salvo.');
        } catch (error) {
          const err = error as Error & { code?: number };
          console.log(
            'Erro ao buscar (cache NÃO salvo pra essa categoria, tenta rodar de novo depois):',
            err.message,
            err.code !== undefined ? `(código TikTok: ${err.code})` : '',
          );
        }
      }
    } finally {
      await app.close();
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
