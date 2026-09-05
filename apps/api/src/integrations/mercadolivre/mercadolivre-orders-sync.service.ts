import { BadRequestException, Injectable } from '@nestjs/common';
import { normalizeMercadoLivreOrder } from '@ecommerce-manager/integrations';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { OrdersService } from '../../orders/orders.service';
import { MercadoLivreConnectorFactory } from './mercadolivre-connector.factory';
import { MercadoLivreCredentialsService } from './mercadolivre-credentials.service';

const MAX_PAGES = 20;
/** Tamanho de página confirmado contra uma chamada real (`paging.limit`). */
const PAGE_SIZE = 50;
/** Teto de linhas de "o que mudou" guardadas por execução (mesmo propósito de
 * `TikTokOrdersSyncService`, tela de Jobs). */
const MAX_CHANGES_RECORDED = 30;

/**
 * Sincronização de pedidos do Mercado Livre — mesmo papel de `TikTokOrdersSyncService`, adaptada
 * à API real confirmada (ver docs/integrations/mercado-livre.md, seção 4).
 *
 * Diferente da TikTok: não existe ainda um filtro de "só o que mudou desde X" confirmado contra
 * uma chamada real (só `seller`/`limit`/`offset` foram exercitados) — por isso esta v1 pagina
 * TODOS os pedidos do vendedor a cada execução, em vez de usar um checkpoint incremental. Isso é
 * seguro (upsert idempotente via `@@unique([companyId, channelId, externalOrderId])`) e simples
 * enquanto o volume de pedidos for baixo; revisitar quando o volume crescer ou um filtro de data
 * for confirmado contra uma resposta real.
 *
 * Também diferente da TikTok: o payload de `GET /orders/search` já traz o pedido COMPLETO em
 * `results[]` (mesmos campos de `GET /orders/{id}`) — não é preciso uma chamada extra por pedido
 * pra sincronização periódica.
 */
@Injectable()
export class MercadoLivreOrdersSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentialsService: MercadoLivreCredentialsService,
    private readonly connectorFactory: MercadoLivreConnectorFactory,
    private readonly ordersService: OrdersService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext('MercadoLivreOrdersSync');
  }

  async syncOrders(
    companyId: string,
    userId: string | null,
  ): Promise<{ imported: number; updated: number; skipped: number; failed: number; changes: string[] }> {
    const integration = await this.credentialsService.requireIntegration(companyId);
    if (!integration.channelId) {
      throw new BadRequestException('Canal Mercado Livre ainda não conectado.');
    }

    const { client, integrationId } = await this.connectorFactory.forCompany(companyId);
    const credentials = await this.credentialsService.getCredentials(integrationId);
    if (!credentials) {
      throw new BadRequestException('Credenciais Mercado Livre não encontradas.');
    }

    let imported = 0;
    let updated = 0;
    // Pedido CANCELLED que a gente ainda não conhece nunca vira registro aqui — mesmo tratamento
    // da TikTok (majoritariamente cancelamento sem valor de negócio; um cancelado que JÁ existe
    // continua sendo atualizado normalmente).
    let skipped = 0;
    let failed = 0;
    const changes: string[] = [];
    let changesOmitted = 0;
    function recordChange(line: string) {
      if (changes.length < MAX_CHANGES_RECORDED) changes.push(line);
      else changesOmitted++;
    }

    let offset = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await client.searchOrders({
        seller: credentials.userId,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });

      for (const order of result.results) {
        try {
          const normalized = normalizeMercadoLivreOrder(order);

          if (normalized.status.toLowerCase() === 'cancelled') {
            const alreadyKnown = await this.prisma.client.order.findUnique({
              where: {
                companyId_channelId_externalOrderId: {
                  companyId,
                  channelId: integration.channelId,
                  externalOrderId: normalized.externalOrderId,
                },
              },
              select: { id: true },
            });
            if (!alreadyKnown) {
              skipped++;
              continue;
            }
          }

          const syncResult = await this.ordersService.importExternalOrder(
            companyId,
            integration.channelId,
            userId,
            normalized,
          );
          if (syncResult.created) {
            imported++;
            recordChange(`Pedido ${normalized.externalOrderId}: importado (${syncResult.toStatus ?? '?'})`);
          } else {
            updated++;
            if (syncResult.statusChanged) {
              recordChange(`Pedido ${normalized.externalOrderId}: ${syncResult.fromStatus} → ${syncResult.toStatus}`);
            }
          }
        } catch (error) {
          failed++;
          this.logger.error('mercadolivre_order_sync_item_failed', {
            operation: 'sync_orders',
            externalOrderId: String(order.id),
            errorMessage: (error as Error).message,
          });
        }
      }

      offset += PAGE_SIZE;
      if (offset >= result.paging.total) break;
    }

    if (changesOmitted > 0) {
      changes.push(`... e mais ${changesOmitted} mudança(s) não listada(s).`);
    }

    this.logger.log('mercadolivre_orders_synced', { operation: 'sync_orders', imported, updated, skipped, failed });
    return { imported, updated, skipped, failed, changes };
  }

  /** Ressincroniza UM pedido específico direto do Mercado Livre — mesmo papel de
   * `TikTokOrdersSyncService.syncSingleOrder`. */
  async syncSingleOrder(companyId: string, userId: string | null, orderId: string) {
    const integration = await this.credentialsService.requireIntegration(companyId);
    if (!integration.channelId) {
      throw new BadRequestException('Canal Mercado Livre ainda não conectado.');
    }

    const existing = await this.prisma.client.order.findFirst({
      where: { id: orderId, companyId, channelId: integration.channelId },
      select: { externalOrderId: true },
    });
    if (!existing?.externalOrderId) {
      throw new BadRequestException('Pedido não encontrado ou sem número externo do Mercado Livre.');
    }

    const { client } = await this.connectorFactory.forCompany(companyId);
    const order = await client.getOrder(existing.externalOrderId);
    const normalized = normalizeMercadoLivreOrder(order);
    const { orderId: resultOrderId } = await this.ordersService.importExternalOrder(
      companyId,
      integration.channelId,
      userId,
      normalized,
    );

    return resultOrderId;
  }
}
