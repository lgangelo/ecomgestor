/* eslint-disable no-console */
/**
 * Diagnóstico — confirma contra uma chamada REAL o "Upload Product File" da TikTok Shop
 * (`POST /product/202309/files/upload`), achado só via documentação oficial (nunca exercitado
 * nesta conta). Duas coisas precisam ser confirmadas: (1) se a assinatura multipart (corpo
 * tratado como string vazia na fórmula do HMAC — ver `TikTokClient.uploadProductFile`) está
 * certa, e (2) o formato exato da resposta (`data.id`? `data.uri`? outra coisa?), pra saber com
 * certeza qual campo referenciar depois no campo `video` de criar/editar produto.
 *
 * NUNCA testa contra um vídeo de verdade de produto — sobe um arquivo de vídeo mínimo qualquer,
 * só pra confirmar o formato da resposta.
 *
 * Uso:
 *   npm run check-tiktok-upload-product-file --workspace=@ecommerce-manager/api -- /caminho/do/video.mp4
 */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { AppModule } from '../app.module';
import { TikTokConnectorFactory } from '../integrations/tiktok/tiktok-connector.factory';

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Uso: npm run check-tiktok-upload-product-file -- /caminho/do/video.mp4');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  const company = await prisma.company.findFirst();
  await prisma.$disconnect();
  if (!company) {
    console.error('Nenhuma empresa encontrada.');
    process.exitCode = 1;
    return;
  }

  const buffer = await readFile(filePath);
  const filename = basename(filePath);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const connectorFactory = app.get(TikTokConnectorFactory);
    const { connector } = await connectorFactory.forCompany(company.id);

    console.log(`Enviando "${filename}" (${buffer.length} bytes)...`);
    const result = await connector.uploadProductFile(buffer, filename);
    console.log('Resposta bruta:');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
