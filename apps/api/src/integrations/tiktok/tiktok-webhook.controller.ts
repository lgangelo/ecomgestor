import { BadRequestException, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { TikTokWebhookService } from './tiktok-webhook.service';

/**
 * Endpoint público de webhook (seção 19) — autenticidade vem da assinatura (seção 20), nunca
 * de sessão/cookie. Sempre responde rápido: valida, deduplica, enfileira — nunca processa
 * pesado aqui (seção 19).
 */
@Controller('webhooks/tiktok')
export class TikTokWebhookController {
  constructor(private readonly webhookService: TikTokWebhookService) {}

  @Post()
  @Public()
  @HttpCode(200)
  async handle(@Req() request: RawBodyRequest<Request>, @Headers('authorization') signature: string | undefined) {
    if (!request.rawBody) {
      throw new BadRequestException('Corpo bruto da requisição ausente.');
    }
    await this.webhookService.ingest(request.rawBody, signature);
    return { received: true };
  }
}
