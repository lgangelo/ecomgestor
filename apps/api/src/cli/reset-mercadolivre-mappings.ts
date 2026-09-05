/* eslint-disable no-console */
/**
 * Limpa os vínculos (`ChannelProductMapping`) do Mercado Livre depois que os anúncios foram
 * apagados manualmente no painel do vendedor — sem isso, `publishEligible` acha que tudo já está
 * publicado (o vínculo continua existindo, só que apontando pra um item que não existe mais) e
 * nunca recria nada; `syncPublished` passa a falhar toda hora tentando atualizar um item apagado.
 *
 * Contexto: um bug real (corrigido nesta mesma sessão — ver docs/integrations/mercado-livre.md,
 * "Achado real corrigido: anúncios duplicados") fazia o serviço criar um anúncio NOVO a cada
 * ciclo do agendador sempre que `setItemDescription` falhava depois do `createItem`, sem nunca
 * salvar o vínculo — isso gerou 157 anúncios duplicados que precisaram ser apagados manualmente.
 * Este script remove os vínculos órfãos correspondentes, pra deixar o próximo ciclo (já com a
 * correção aplicada) recriar tudo do zero, corretamente.
 *
 * Modo diagnóstico (padrão): só lista quantos vínculos seriam removidos.
 * Modo confirmação (--confirm): remove de fato.
 *
 * Uso:
 *   npm run reset-mercadolivre-mappings --workspace=@ecommerce-manager/api            # diagnóstico
 *   npm run reset-mercadolivre-mappings --workspace=@ecommerce-manager/api -- --confirm # remove
 */
import { ChannelType, PrismaClient } from '@ecommerce-manager/database';

async function main() {
  const confirm = process.argv.includes('--confirm');

  const prisma = new PrismaClient();
  try {
    const company = await prisma.company.findFirst();
    if (!company) {
      console.error('Nenhuma empresa encontrada.');
      process.exitCode = 1;
      return;
    }

    const channel = await prisma.salesChannel.findFirst({
      where: { companyId: company.id, type: ChannelType.MERCADO_LIVRE },
    });
    if (!channel) {
      console.log('Nenhum canal Mercado Livre encontrado — nada a limpar.');
      return;
    }

    const mappings = await prisma.channelProductMapping.findMany({
      where: { channelId: channel.id, variantId: { not: null } },
    });

    if (mappings.length === 0) {
      console.log('Nenhum vínculo encontrado — nada a limpar.');
      return;
    }

    console.log(`${mappings.length} vínculo(s) encontrado(s) pro canal Mercado Livre (${channel.id}).`);

    if (!confirm) {
      console.log('Modo DIAGNÓSTICO — nada foi removido. Rode de novo com --confirm pra remover de fato.');
      return;
    }

    const result = await prisma.channelProductMapping.deleteMany({
      where: { channelId: channel.id, variantId: { not: null } },
    });
    console.log(`Removidos: ${result.count} vínculo(s). O próximo ciclo do agendador vai recriar tudo do zero.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
