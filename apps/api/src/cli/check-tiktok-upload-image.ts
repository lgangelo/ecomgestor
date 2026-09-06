/* eslint-disable no-console */
/**
 * Diagnóstico — confirma contra uma chamada REAL o "Upload Product Image" da TikTok Shop
 * (`POST /product/202309/images/upload`), achado via documentação oficial (exemplo de resposta
 * reproduzido literalmente: `{code:0, data:{uri, url, height, width, use_case}, message}`) mas
 * NUNCA exercitado nesta conta — ver `TikTokClient.uploadImage`. Precisa confirmar (1) se a
 * assinatura multipart está certa e (2) se os campos batem exatamente com `TikTokUploadedImage`.
 *
 * NUNCA testa contra uma foto de verdade de produto — sobe uma imagem de teste qualquer, só pra
 * confirmar o formato da resposta.
 *
 * Uso:
 *   npm run check-tiktok-upload-image --workspace=@ecommerce-manager/api -- /caminho/da/imagem.jpg
 *   npm run check-tiktok-upload-image --workspace=@ecommerce-manager/api -- /caminho/da/imagem.jpg ATTRIBUTE_IMAGE
 */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { TikTokImageUseCase } from '@ecommerce-manager/integrations';
import { AppModule } from '../app.module';
import { TikTokConnectorFactory } from '../integrations/tiktok/tiktok-connector.factory';

async function main() {
  const filePath = process.argv[2];
  const useCase = (process.argv[3] ?? 'MAIN_IMAGE') as TikTokImageUseCase;
  if (!filePath) {
    console.error('Uso: npm run check-tiktok-upload-image -- /caminho/da/imagem.jpg [useCase opcional, default MAIN_IMAGE]');
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

    console.log(`Enviando "${filename}" (${buffer.length} bytes) com use_case=${useCase}...`);
    const result = await connector.uploadImage(buffer, filename, useCase);
    console.log('Resposta:');
    console.log(`  uri: ${result.uri}`);
    console.log(`  url: ${result.url}`);
    console.log(`  width: ${result.width}`);
    console.log(`  height: ${result.height}`);
    console.log(`  useCase: ${result.useCase}`);
    console.log(
      "IMPORTANTE: guarde esse 'uri' — é isso que vai no payload de criar produto, nunca a 'url' completa, segundo a documentação oficial.",
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
