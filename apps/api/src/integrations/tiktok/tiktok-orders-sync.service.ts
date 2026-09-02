import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { OrdersService } from '../../orders/orders.service';
import { TikTokConnectorFactory } from './tiktok-connector.factory';
import { TikTokCredentialsService } from './tiktok-credentials.service';
import { TikTokFinanceSyncService } from './tiktok-finance-sync.service';

const MAX_PAGES = 20;
/** Janela de sobreposição (seção 13 da Fase 3) — protege contra pedidos atualizados por um
 * instante entre a última sincronização e agora que poderiam ser perdidos numa busca exata. */
const OVERLAP_MS = 10 * 60 * 1000;

interface SyncCheckpoints {
  ordersSyncAt?: string;
  productsSyncAt?: string;
  financeSyncAt?: string;
}

/**
 * Sincronização incremental de pedidos (seção 13-14-15-17-18 da Fase 3). Usada tanto pela
 * importação inicial (wizard) quanto pela reconciliação periódica — ambas são, na prática, a
 * mesma operação: buscar pedidos atualizados desde o checkpoint (com sobreposição) e fazer
 * upsert via `OrdersService.importExternalOrder`, que decide sozinho se é uma criação
 * histórica ou uma atualização de status de um pedido já existente.
 */
@Injectable()
export class TikTokOrdersSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentialsService: TikTokCredentialsService,
    private readonly connectorFactory: TikTokConnectorFactory,
    private readonly ordersService: OrdersService,
    private readonly financeSync: TikTokFinanceSyncService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext('TikTokOrdersSync');
  }

  async syncOrders(
    companyId: string,
    userId: string | null,
    explicitSince?: Date,
  ): Promise<{ imported: number; updated: number; skipped: number; failed: number }> {
    const integration = await this.credentialsService.requireIntegration(companyId);
    if (!integration.channelId) {
      throw new BadRequestException('Canal TikTok Shop ainda não conectado.');
    }

    const { connector } = await this.connectorFactory.forCompany(companyId);
    const checkpoints = (integration.syncCheckpoints as SyncCheckpoints | null) ?? {};
    const lastSync = checkpoints.ordersSyncAt ? new Date(checkpoints.ordersSyncAt) : undefined;
    // `explicitSince` (o "Pedidos desde" do assistente de importação) filtra por DATA DE
    // CRIAÇÃO — é uma carga histórica, e um pedido antigo entregue e nunca mais tocado tem
    // update_time antigo mesmo sendo exatamente o que se quer trazer (confirmado em produção:
    // filtrar isso por update_time_ge excluía silenciosamente o histórico real da loja). Sem
    // data explícita, a reconciliação automática continua por ÚLTIMA ATUALIZAÇÃO desde o
    // checkpoint — histórico já importado, só o que mudou de status.
    const createdAfter = explicitSince;
    const updatedAfter = explicitSince ? undefined : lastSync ? new Date(lastSync.getTime() - OVERLAP_MS) : undefined;
    // A mesma carga histórica nunca deve mexer no saldo de estoque: o estoque atual já foi
    // sincronizado do canal externo e já reflete essas vendas antigas — aplicar de novo
    // debitaria o mesmo estoque duas vezes, podendo levar o saldo a negativo (confirmado em
    // produção). Reconciliação/webhook ao vivo continua movimentando estoque normalmente.
    const skipStockMovement = Boolean(explicitSince);

    const startedAt = new Date();
    let imported = 0;
    let updated = 0;
    // Pedidos CANCELADOS que a gente ainda não conhece nunca viram registro aqui — a grande
    // maioria é a TikTok cancelando sozinha após 24h sem pagamento (o cliente nunca chegou a
    // comprar de verdade), sem valor nenhum de negócio. Um pedido cancelado que JÁ existe no
    // nosso sistema (ex.: foi pago e cancelado/estornado depois) continua sendo atualizado
    // normalmente — só a CRIAÇÃO de um pedido novo já nascendo cancelado é que é pulada.
    let skipped = 0;
    // Cada pedido é processado de forma independente — um erro num pedido específico (ex.:
    // conflito de estoque) nunca aborta o lote inteiro, só entra na contagem de falhas.
    let failed = 0;
    // Se algum pedido falhar, o checkpoint não pode avançar para além dele — senão, como a
    // TikTok só reporta `update_time` quando algo muda do lado dela, um pedido que falhou por
    // um erro NOSSO (ex.: erro transitório de estoque) nunca mais seria buscado de novo (nada
    // muda pra ele na TikTok depois da tentativa). Guardar o menor `update_time` entre as
    // falhas e usá-lo como novo checkpoint garante que a próxima sincronização tente de novo.
    let minFailedUpdateTime: Date | undefined;
    let pageToken: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await connector.getOrders(companyId, { pageSize: 50, pageToken, updatedAfter, createdAfter });
      for (const order of result.items) {
        try {
          if (order.status.toUpperCase() === 'CANCELLED') {
            const alreadyKnown = await this.prisma.client.order.findUnique({
              where: {
                companyId_channelId_externalOrderId: {
                  companyId,
                  channelId: integration.channelId,
                  externalOrderId: order.externalOrderId,
                },
              },
              select: { id: true },
            });
            if (!alreadyKnown) {
              skipped++;
              continue;
            }
          }

          const { created } = await this.ordersService.importExternalOrder(
            companyId,
            integration.channelId,
            userId,
            order,
            { skipStockMovement },
          );
          if (created) imported++;
          else updated++;
        } catch (error) {
          failed++;
          if (order.externalUpdatedAt && (!minFailedUpdateTime || order.externalUpdatedAt < minFailedUpdateTime)) {
            minFailedUpdateTime = order.externalUpdatedAt;
          }
          this.logger.error('tiktok_order_sync_item_failed', {
            operation: 'sync_orders',
            externalOrderId: order.externalOrderId,
            errorMessage: (error as Error).message,
          });
        }
      }
      if (!result.nextPageToken) break;
      pageToken = result.nextPageToken;
    }

    const nextCheckpoint = minFailedUpdateTime && minFailedUpdateTime < startedAt ? minFailedUpdateTime : startedAt;

    await this.prisma.client.integration.update({
      where: { id: integration.id },
      data: {
        lastSyncAt: new Date(),
        syncCheckpoints: { ...checkpoints, ordersSyncAt: nextCheckpoint.toISOString() },
      },
    });

    this.logger.log('tiktok_orders_synced', { operation: 'sync_orders', imported, updated, skipped, failed });
    return { imported, updated, skipped, failed };
  }

  /**
   * Ressincroniza UM pedido específico direto da TikTok, sem depender do checkpoint/janela de
   * `update_time` — usado como botão manual na tela do pedido. `syncOrders` só busca pedidos cujo
   * `update_time` está dentro da janela desde o último checkpoint; se um pedido falhou ao ser
   * processado numa execução anterior (ex.: erro transitório de estoque), o checkpoint já avançou
   * e a TikTok não vai reportar `update_time` de novo pra ele (nada mudou do lado dela) — esse
   * pedido nunca mais seria buscado pela sincronização periódica, ficando "órfão" para sempre.
   * Este método busca o pedido pelo ID direto (`Get Order`), contornando esse problema.
   */
  async syncSingleOrder(companyId: string, userId: string | null, orderId: string) {
    const integration = await this.credentialsService.requireIntegration(companyId);
    if (!integration.channelId) {
      throw new BadRequestException('Canal TikTok Shop ainda não conectado.');
    }

    const existing = await this.prisma.client.order.findFirst({
      where: { id: orderId, companyId, channelId: integration.channelId },
      select: { externalOrderId: true },
    });
    if (!existing?.externalOrderId) {
      throw new BadRequestException('Pedido não encontrado ou sem número externo da TikTok.');
    }

    const { connector } = await this.connectorFactory.forCompany(companyId);
    const order = await connector.getOrder(companyId, existing.externalOrderId);
    const { orderId: resultOrderId } = await this.ordersService.importExternalOrder(
      companyId,
      integration.channelId,
      userId,
      order,
    );

    // Best-effort: junto com o status, também tenta buscar a taxa da plataforma direto por
    // pedido (nunca depende de achar o extrato certo entre os ~500 mais recentes da varredura em
    // lote — ver comentário em `TikTokFinanceSyncService.syncOrderFee`). Uma falha aqui nunca
    // deve derrubar a ressincronização do pedido, que já é o efeito principal deste botão.
    try {
      await this.financeSync.syncOrderFee(companyId, resultOrderId);
    } catch (error) {
      this.logger.warn('tiktok_order_fee_sync_failed', {
        operation: 'sync_single_order',
        orderId: resultOrderId,
        externalOrderId: existing.externalOrderId,
        errorMessage: (error as Error).message,
      });
    }

    return this.prisma.client.order.findUnique({ where: { id: resultOrderId }, select: { id: true, status: true } });
  }
}
