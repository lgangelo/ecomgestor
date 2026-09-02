/* eslint-disable no-console */
/**
 * Cria os 4 canais manuais de venda (Instagram, WhatsApp, Loja física, Outro) para toda empresa
 * que ainda não os tem — sem isso, "Nova venda" falha com "Canal manual do tipo X não está
 * cadastrado para esta empresa" pra QUALQUER canal, não só um específico. Idempotente (upsert):
 * seguro rodar em qualquer empresa, mesmo uma que já tenha os canais.
 *
 * Uso:
 *   npm run backfill-manual-channels
 */
import { ChannelType, PrismaClient } from '@ecommerce-manager/database';
import { MANUAL_SALE_CHANNELS } from '@ecommerce-manager/shared';

const prisma = new PrismaClient();

// Mesmos nomes exibidos no formulário de venda manual (`manual-sale-form.tsx`) — nunca inventa
// um nome novo aqui.
const MANUAL_CHANNEL_NAMES: Record<(typeof MANUAL_SALE_CHANNELS)[number], string> = {
  INSTAGRAM: 'Instagram',
  WHATSAPP: 'WhatsApp',
  LOJA_FISICA: 'Loja física',
  OUTRO: 'Outro',
};

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  console.log(`Empresas encontradas: ${companies.length}`);

  for (const company of companies) {
    let created = 0;
    for (const type of MANUAL_SALE_CHANNELS) {
      const existing = await prisma.salesChannel.findFirst({ where: { companyId: company.id, type: type as ChannelType } });
      if (existing) continue;
      await prisma.salesChannel.create({
        data: { companyId: company.id, name: MANUAL_CHANNEL_NAMES[type], type: type as ChannelType, isManual: true },
      });
      created++;
    }
    console.log(`  ${company.name}: ${created} canal(is) manual(is) criado(s) (dos 4 esperados).`);
  }
}

main()
  .catch((err) => {
    console.error('Erro:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
