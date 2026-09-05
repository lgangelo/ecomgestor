import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationProvider, IntegrationStatus } from '@ecommerce-manager/database';
import { encryptSecret, decryptSecret } from '@ecommerce-manager/shared-server';
import type { MercadoLivreCredentials } from '@ecommerce-manager/integrations';
import { PrismaService } from '../../common/prisma/prisma.service';

const CREDENTIAL_KEYS = ['user_id', 'access_token', 'refresh_token', 'access_token_expires_at', 'refresh_token_expires_at'] as const;

/**
 * CRUD de `integration_credentials` pro Mercado Livre, mesmo padrão de
 * `shopee-credentials.service.ts`/`tiktok-credentials.service.ts`: sempre criptografado em
 * repouso, nenhum valor em log.
 */
@Injectable()
export class MercadoLivreCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private get secretsKey(): string {
    return this.configService.get<string>('integrationSecretsKey')!;
  }

  async getOrCreateIntegration(companyId: string) {
    const existing = await this.prisma.client.integration.findUnique({
      where: { companyId_provider: { companyId, provider: IntegrationProvider.MERCADO_LIVRE } },
    });
    if (existing) return existing;

    return this.prisma.client.integration.create({
      data: { companyId, provider: IntegrationProvider.MERCADO_LIVRE, status: IntegrationStatus.DISCONNECTED },
    });
  }

  async saveCredentials(integrationId: string, credentials: MercadoLivreCredentials): Promise<void> {
    const values: Record<string, string> = {
      user_id: credentials.userId,
      access_token: credentials.accessToken,
      refresh_token: credentials.refreshToken,
      access_token_expires_at: credentials.accessTokenExpiresAt.toISOString(),
      // NÃO CONFIRMADO (ver mercado-livre.md): validade do refresh_token não confirmada —
      // guarda vazio quando ausente, nunca inventa uma data.
      refresh_token_expires_at: credentials.refreshTokenExpiresAt?.toISOString() ?? '',
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

  async getCredentials(integrationId: string): Promise<MercadoLivreCredentials | null> {
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

    const userId = decrypted.get('user_id');
    const accessToken = decrypted.get('access_token');
    const refreshToken = decrypted.get('refresh_token');
    if (!userId || !accessToken || !refreshToken) return null;

    const refreshTokenExpiresAtRaw = decrypted.get('refresh_token_expires_at');

    return {
      userId,
      accessToken,
      refreshToken,
      accessTokenExpiresAt: new Date(decrypted.get('access_token_expires_at') ?? 0),
      refreshTokenExpiresAt: refreshTokenExpiresAtRaw ? new Date(refreshTokenExpiresAtRaw) : undefined,
    };
  }

  async requireIntegration(companyId: string) {
    const integration = await this.prisma.client.integration.findUnique({
      where: { companyId_provider: { companyId, provider: IntegrationProvider.MERCADO_LIVRE } },
    });
    if (!integration) throw new NotFoundException('Integração Mercado Livre não encontrada');
    return integration;
  }

  /** Toggle por integração (Bloco 2) — nunca liga o envio automático de estoque sozinho; quem
   * também precisa estar ligado é a flag global `MERCADOLIVRE_INVENTORY_PUSH_ENABLED` (ver
   * `MercadoLivreStockOutboxService.processPending`). */
  async setAutoInventorySyncEnabled(companyId: string, enabled: boolean): Promise<void> {
    const integration = await this.requireIntegration(companyId);
    await this.prisma.client.integration.update({
      where: { id: integration.id },
      data: { autoInventorySyncEnabled: enabled },
    });
  }
}
