import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationProvider, IntegrationStatus } from '@ecommerce-manager/database';
import { encryptSecret, decryptSecret } from '@ecommerce-manager/shared-server';
import type { ShopeeCredentials } from '@ecommerce-manager/integrations';
import { PrismaService } from '../../common/prisma/prisma.service';

const CREDENTIAL_KEYS = [
  'shop_id',
  'merchant_id',
  'shop_name',
  'access_token',
  'refresh_token',
  'access_token_expires_at',
  'refresh_token_expires_at',
] as const;

/**
 * CRUD de `integration_credentials` para a Shopee, mesmo padrão de
 * `tiktok-credentials.service.ts`: sempre criptografado em repouso, nenhum valor em log.
 */
@Injectable()
export class ShopeeCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private get secretsKey(): string {
    return this.configService.get<string>('integrationSecretsKey')!;
  }

  async getOrCreateIntegration(companyId: string) {
    const existing = await this.prisma.client.integration.findUnique({
      where: { companyId_provider: { companyId, provider: IntegrationProvider.SHOPEE } },
    });
    if (existing) return existing;

    return this.prisma.client.integration.create({
      data: { companyId, provider: IntegrationProvider.SHOPEE, status: IntegrationStatus.DISCONNECTED },
    });
  }

  async saveCredentials(integrationId: string, credentials: ShopeeCredentials): Promise<void> {
    const values: Record<string, string> = {
      shop_id: credentials.shopId ?? '',
      merchant_id: credentials.merchantId ?? '',
      shop_name: credentials.shopName ?? '',
      access_token: credentials.accessToken,
      refresh_token: credentials.refreshToken,
      access_token_expires_at: credentials.accessTokenExpiresAt.toISOString(),
      refresh_token_expires_at: credentials.refreshTokenExpiresAt.toISOString(),
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

  async getCredentials(integrationId: string): Promise<ShopeeCredentials | null> {
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
      merchantId: decrypted.get('merchant_id') || undefined,
      shopName: decrypted.get('shop_name') || undefined,
      accessToken,
      refreshToken,
      accessTokenExpiresAt: new Date(decrypted.get('access_token_expires_at') ?? 0),
      refreshTokenExpiresAt: new Date(decrypted.get('refresh_token_expires_at') ?? 0),
    };
  }

  async requireIntegration(companyId: string) {
    const integration = await this.prisma.client.integration.findUnique({
      where: { companyId_provider: { companyId, provider: IntegrationProvider.SHOPEE } },
    });
    if (!integration) throw new NotFoundException('Integração Shopee não encontrada');
    return integration;
  }
}
