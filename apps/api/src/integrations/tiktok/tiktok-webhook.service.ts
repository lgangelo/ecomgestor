import { createHash } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationStatus, Prisma } from '@ecommerce-manager/database';
import { verifyTikTokWebhookSignature } from '@ecommerce-manager/integrations';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { TikTokQueueService } from '../../queue/tiktok-queue.service';
import { TikTokCredentialsService } from './tiktok-credentials.service';
import { minimizeTikTokWebhookPayload } from './tiktok-webhook-payload.util';

interface ParsedWebhook {
  eventType: string;
  externalEventId?: string;
  shopId?: string;
}

/**
 * Recebimento de webhook da TikTok Shop (seção 19-21-22 da Fase 3). Responde rápido e nunca
 * processa nada pesado aqui — só valida, deduplica e enfileira. O processamento de fato
 * (buscar o pedido atual via API, normalizar, aplicar) acontece no worker (seção 22: nunca
 * confiar que o payload do webhook tem tudo que precisa).
 */
@Injectable()
export class TikTokWebhookService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly credentialsService: TikTokCredentialsService,
    private readonly queue: TikTokQueueService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext('TikTokWebhook');
  }

  async ingest(rawBody: Buffer, signatureHeader: string | undefined): Promise<void> {
    const appKey = this.configService.get<string>('tiktok.appKey', { infer: true }) as string;
    const appSecret = this.configService.get<string>('tiktok.appSecret', { infer: true }) as string;

    if (!appKey || !appSecret) {
      throw new UnauthorizedException('TikTok Shop não configurado neste ambiente.');
    }

    const valid = verifyTikTokWebhookSignature({ appKey, appSecret, rawBody, signatureHeader });
    if (!valid) {
      this.logger.warn('tiktok_webhook_invalid_signature', { operation: 'webhook_ingest' });
      throw new UnauthorizedException('Assinatura de webhook inválida.');
    }

    const json: unknown = JSON.parse(rawBody.toString('utf8'));
    const parsed = this.parse(json);
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');

    const integration = await this.resolveIntegration(parsed.shopId);
    if (!integration) {
      this.logger.warn('tiktok_webhook_unresolved_shop', { operation: 'webhook_ingest', shopId: parsed.shopId });
      return;
    }

    const duplicate = await this.findDuplicate(integration.id, parsed.externalEventId, payloadHash);
    if (duplicate) {
      this.logger.log('tiktok_webhook_duplicate', { operation: 'webhook_ingest', integrationId: integration.id });
      return;
    }

    const event = await this.prisma.client.webhookEvent.create({
      data: {
        integrationId: integration.id,
        eventType: parsed.eventType,
        externalEventId: parsed.externalEventId ?? null,
        payloadHash,
        payload: minimizeTikTokWebhookPayload(json) as Prisma.InputJsonValue,
        status: 'PENDING',
      },
    });

    await this.queue.enqueueProcessWebhook({ webhookEventId: event.id });
    this.logger.log('tiktok_webhook_enqueued', {
      operation: 'webhook_ingest',
      integrationId: integration.id,
      eventType: parsed.eventType,
    });
  }

  private parse(json: unknown): ParsedWebhook {
    const obj = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
    const eventType = obj.type ? String(obj.type) : obj.event ? String(obj.event) : 'unknown';
    const externalEventId = obj.tts_notification_id
      ? String(obj.tts_notification_id)
      : obj.notification_id
        ? String(obj.notification_id)
        : undefined;
    const shopId = obj.shop_id ? String(obj.shop_id) : undefined;
    return { eventType, externalEventId, shopId };
  }

  private async findDuplicate(integrationId: string, externalEventId: string | undefined, payloadHash: string) {
    if (externalEventId) {
      return this.prisma.client.webhookEvent.findUnique({
        where: { integrationId_externalEventId: { integrationId, externalEventId } },
      });
    }
    return this.prisma.client.webhookEvent.findFirst({ where: { integrationId, payloadHash } });
  }

  /**
   * Um único app TikTok Shop pode autorizar mais de uma loja (seção 6) — o `shop_id` do evento
   * decide a qual `Integration` ele pertence. Quando há só uma integração conectada, resolve
   * direto (caso comum de instalação single-tenant) sem precisar descriptografar nada.
   */
  private async resolveIntegration(shopId: string | undefined) {
    const integrations = await this.prisma.client.integration.findMany({
      where: { provider: 'TIKTOK_SHOP', status: IntegrationStatus.CONNECTED },
    });
    if (integrations.length === 0) return null;
    if (integrations.length === 1) return integrations[0];
    if (!shopId) return null;

    for (const integration of integrations) {
      const credentials = await this.credentialsService.getCredentials(integration.id);
      if (credentials?.shopId === shopId) return integration;
    }
    return null;
  }
}
