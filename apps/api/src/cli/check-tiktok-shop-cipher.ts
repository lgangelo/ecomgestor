/* eslint-disable no-console */
/**
 * Diagnóstico — valida de novo tudo que sabemos sobre `shop_cipher` (pedido do usuário, depois de
 * um erro persistente e contraditório em "Get Attributes": com o parâmetro presente, a TikTok diz
 * "não é necessário" (código 36009004); sem ele, diz "é obrigatório" (código 106013 documentado) —
 * pro MESMO endpoint, MESMA conta).
 *
 * `shop_cipher` só é obtido UMA VEZ, no momento de conectar/reconectar a loja (`Get Authorized
 * Shops`, ver `tiktok-oauth.service.ts`) — o refresh de token automático NUNCA o busca de novo.
 * Se a TikTok girou/invalidou o valor por qualquer motivo depois disso (ex.: mudança de escopo,
 * reautorização parcial), o valor salvo pode estar desatualizado sem que nada tenha avisado, já
 * que a maioria das chamadas de negócio (busca de produto, pedidos, estoque) parece tolerar um
 * `shop_cipher` "errado" sem reclamar — só "Get Attributes" validaria de forma mais estrita.
 *
 * Este script NUNCA sobrescreve nada — só imprime o valor salvo (mascarado) lado a lado com um
 * valor buscado NA HORA (chamada real a "Get Authorized Shops" com o access_token atual), pra
 * confirmar visualmente se batem ou não.
 *
 * Uso:
 *   npm run check-tiktok-shop-cipher --workspace=@ecommerce-manager/api --
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@ecommerce-manager/database';
import { TikTokClient, getAuthorizedShops } from '@ecommerce-manager/integrations';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../app.module';
import { TikTokCredentialsService } from '../integrations/tiktok/tiktok-credentials.service';
import { TikTokTokenRefreshService } from '../integrations/tiktok/tiktok-token-refresh.service';

function mask(value: string | undefined): string {
  if (!value) return '(vazio)';
  if (value.length <= 8) return `${value[0]}***`;
  return `${value.slice(0, 4)}...${value.slice(-4)} (${value.length} caracteres)`;
}

async function main() {
  const prisma = new PrismaClient();
  const company = await prisma.company.findFirst();
  await prisma.$disconnect();
  if (!company) {
    console.error('Nenhuma empresa encontrada.');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const credentialsService = app.get(TikTokCredentialsService);
    const tokenRefresh = app.get(TikTokTokenRefreshService);
    const configService = app.get(ConfigService);

    const integration = await credentialsService.requireIntegration(company.id);
    const stored = await credentialsService.getCredentials(integration.id);
    if (!stored) {
      console.error('Integração TikTok Shop sem credenciais salvas — precisa conectar primeiro.');
      process.exitCode = 1;
      return;
    }

    console.log('=== Salvo no banco (integração atual) ===');
    console.log(`shop_id:      ${mask(stored.shopId)}`);
    console.log(`shop_cipher:  ${mask(stored.shopCipher)}`);
    console.log(`seller_name:  ${stored.sellerName ?? '(vazio)'}`);
    console.log(`region:       ${stored.region ?? '(vazio)'}`);
    console.log(`access_token expira em: ${stored.accessTokenExpiresAt.toISOString()}`);
    console.log(`refresh_token expira em: ${stored.refreshTokenExpiresAt.toISOString()}`);

    const freshAccessToken = await tokenRefresh.ensureFreshAccessToken(integration.id, company.id);
    const appKey = configService.get<string>('tiktok.appKey', { infer: true }) as string;
    const appSecret = configService.get<string>('tiktok.appSecret', { infer: true }) as string;

    // Sem shopCipher configurado de propósito — "Get Authorized Shops" é a própria fonte do
    // shop_cipher, nunca precisa (nem aceita) um já existente.
    const bareClient = new TikTokClient({ appKey, appSecret, accessToken: freshAccessToken });
    const shops = await getAuthorizedShops(bareClient);

    console.log('\n=== Buscado agora, na hora (Get Authorized Shops) ===');
    if (shops.length === 0) {
      console.log('Nenhuma loja autorizada devolvida — inesperado pra uma integração já conectada.');
    }
    for (const shop of shops) {
      console.log(`shop_id:      ${mask(shop.shopId)}`);
      console.log(`shop_cipher:  ${mask(shop.shopCipher)}`);
      console.log(`shop_name:    ${shop.shopName ?? '(vazio)'}`);
      console.log(`region:       ${shop.region ?? '(vazio)'}`);
    }

    console.log('\n=== Comparação ===');
    const freshShop = shops[0];
    if (!freshShop) {
      console.log('Não foi possível comparar — "Get Authorized Shops" não devolveu nada agora.');
    } else if (freshShop.shopCipher === stored.shopCipher) {
      console.log('shop_cipher salvo BATE com o buscado agora — não está desatualizado.');
    } else {
      console.log(
        'ATENÇÃO: shop_cipher salvo é DIFERENTE do buscado agora — o valor salvo está desatualizado. ' +
          'Reconectar a integração (reautorizar pelo Seller Center) deve resolver.',
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err, err.code !== undefined ? `(código TikTok: ${err.code})` : '');
  process.exitCode = 1;
});
