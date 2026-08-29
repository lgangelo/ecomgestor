import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationProvider, IntegrationStatus } from '@ecommerce-manager/database';
import { encryptSecret, decryptSecret } from '@ecommerce-manager/shared-server';
import type { TikTokCredentials } from '@ecommerce-manager/integrations';
import { PrismaService } from '../../common/prisma/prisma.service';

const CREDENTIAL_KEYS = [
  'shop_id',
  'shop_cipher',
  'seller_name',
  'access_token',
  'refresh_token',
  'access_token_expires_at',
  'refresh_token_expires_at',
  'scopes',
  'region',
] as const;

/**
 * CRUD de `integration_credentials` para a TikTok Shop, sempre criptografado em repouso
 * (seção 5 da Fase 3) via `packages/shared-server/src/crypto.ts` — nenhum valor chega ao banco
 * em texto puro, e nenhum destes valores é registrado em log (nunca passar por
 * AppLoggerService diretamente; use apenas os campos não sensíveis retornados por
 * `getIntegrationSummary`).
 */
@Injectable()
export class TikTokCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private get secretsKey(): string {
    return this.configService.get<string>('integrationSecretsKey')!;
  }

  async getOrCreateIntegration(companyId: string) {
    const existing = await this.prisma.client.integration.findUnique({
      where: { companyId_provider: { companyId, provider: IntegrationProvider.TIKTOK_SHOP } },
    });
    if (existing) return existing;

    return this.prisma.client.integration.create({
      data: { companyId, provider: IntegrationProvider.TIKTOK_SHOP, status: IntegrationStatus.DISCONNECTED },
    });
  }

  async saveCredentials(integrationId: string, credentials: TikTokCredentials): Promise<void> {
    const values: Record<string, string> = {
      shop_id: credentials.shopId ?? '',
      shop_cipher: credentials.shopCipher ?? '',
      seller_name: credentials.sellerName ?? '',
      access_token: credentials.accessToken,
      refresh_token: credentials.refreshToken,
      access_token_expires_at: credentials.accessTokenExpiresAt.toISOString(),
      refresh_token_expires_at: credentials.refreshTokenExpiresAt.toISOString(),
      scopes: credentials.scopes ?? '',
      region: credentials.region ?? '',
    };

    await this.prisma.client.$transaction(
      CREDENTIAL_KEYS.map((key) =>
        this.prisma.client.integrationCredential.upsert({
          where: { integrationId_key: { integrationId, key } },
          create: { integrationId, key, value: encryptSecret(values[key], this.secretsKey) },
          update: { value: encryptSecret(values[key], this.secretsKey) },
        }),
      ),
    );
  }

  async getCredentials(integrationId: string): Promise<TikTokCredentials | null> {
    const rows = await this.prisma.client.integrationCredential.findMany({ where: { integrationId } });
    if (rows.length === 0) return null;

    const decrypted = new Map<string, string>();
    for (const row of rows) {
      try {
        decrypted.set(row.key, decryptSecret(row.value, this.secretsKey));
      } catch {
        // Segredo ilegível (chave rotacionada, corrupção) — tratado como credencial ausente,
        // nunca lançamos o valor bruto nem detalhes de criptografia no erro.
        return null;
      }
    }

    const accessToken = decrypted.get('access_token');
    const refreshToken = decrypted.get('refresh_token');
    if (!accessToken || !refreshToken) return null;

    return {
      shopId: decrypted.get('shop_id') || undefined,
      shopCipher: decrypted.get('shop_cipher') || undefined,
      sellerName: decrypted.get('seller_name') || undefined,
      accessToken,
      refreshToken,
      accessTokenExpiresAt: new Date(decrypted.get('access_token_expires_at') ?? 0),
      refreshTokenExpiresAt: new Date(decrypted.get('refresh_token_expires_at') ?? 0),
      scopes: decrypted.get('scopes') || undefined,
      region: decrypted.get('region') || undefined,
    };
  }

  async requireIntegration(companyId: string) {
    const integration = await this.prisma.client.integration.findUnique({
      where: { companyId_provider: { companyId, provider: IntegrationProvider.TIKTOK_SHOP } },
    });
    if (!integration) throw new NotFoundException('Integração TikTok Shop não encontrada');
    return integration;
  }
}
