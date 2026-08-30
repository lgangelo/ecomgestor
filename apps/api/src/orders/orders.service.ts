import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ChannelType, ChannelMappingSyncStatus, OrderStatus, Prisma } from '@ecommerce-manager/database';
import type { ExternalOrder } from '@ecommerce-manager/integrations';
import { PrismaService } from '../common/prisma/prisma.service';
import { paginate } from '../common/dto/pagination.dto';
import { InventoryLedgerService, MovementContext } from '../inventory/ledger.service';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CreateManualOrderDto } from './dto/create-manual-order.dto';
import { assertValidTransition, isPreShipmentStatus } from './order-state-machine';

/** Únicos status internos conhecidos — usado para validar o `internalStatus` vindo do mapper
 * de um canal externo antes de gravá-lo (nunca confiamos cegamente em uma string externa). */
const KNOWN_ORDER_STATUSES = new Set<string>(Object.values(OrderStatus));

/** Posição no "caminho feliz" linear — usada só para detectar regressão em atualizações
 * vindas de um canal externo (seção 24 da Fase 3). Status fora deste mapa (CANCELLED,
 * RETURN_REQUESTED, RETURNED, REFUNDED, PARTIALLY_REFUNDED) nunca são tratados como regressão
 * aqui — são ramificações de negócio, não uma volta no tempo do fulfillment.
 */
const LINEAR_RANK: Partial<Record<OrderStatus, number>> = {
  [OrderStatus.CREATED]: 0,
  [OrderStatus.PAID]: 1,
  [OrderStatus.PROCESSING]: 2,
  [OrderStatus.READY_TO_SHIP]: 3,
  [OrderStatus.SHIPPED]: 4,
  [OrderStatus.DELIVERED]: 5,
};

function isRegressiveExternalTransition(from: OrderStatus, to: OrderStatus): boolean {
  const fromRank = LINEAR_RANK[from];
  const toRank = LINEAR_RANK[to];
  if (fromRank === undefined || toRank === undefined) return false;
  return toRank < fromRank;
}

interface ImportItemLike {
  variantId: string | null;
  quantity: number;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: InventoryLedgerService,
  ) {}

  async findAll(companyId: string, query: QueryOrdersDto) {
    const where: Prisma.OrderWhereInput = {
      companyId,
      ...(query.channelId ? { channelId: query.channelId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.syncStatus ? { integrationSyncStatus: query.syncStatus } : {}),
      ...(query.customerName
        ? { customerName: { contains: query.customerName, mode: 'insensitive' as const } }
        : {}),
      ...(query.productId
        ? { items: { some: { variant: { productId: query.productId } } } }
        : {}),
      ...(query.hasFiscalDocument !== undefined
        ? query.hasFiscalDocument
          ? { fiscalDocuments: { some: {} } }
          : { fiscalDocuments: { none: {} } }
        : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            orderDate: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.client.order.findMany({
        where,
        include: { channel: { select: { name: true } } },
        orderBy: { orderDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.order.count({ where }),
    ]);

    const items = rows.map((row) => ({
      id: row.id,
      orderDate: row.orderDate,
      externalOrderId: row.externalOrderId,
      channelName: row.channel.name,
      customerName: row.customerName,
      total: row.total,
      status: row.status,
      integrationSyncStatus: row.integrationSyncStatus,
    }));

    return paginate(items, total, query.page, query.pageSize);
  }

  async findOne(id: string, companyId: string) {
    const order = await this.prisma.client.order.findFirst({
      where: { id, companyId },
      include: {
        channel: { select: { id: true, name: true, type: true } },
        items: true,
        payments: true,
        statusHistory: { orderBy: { changedAt: 'asc' } },
        fiscalDocuments: true,
      },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');

    const marketplaceFees = await this.prisma.client.marketplaceFee.aggregate({
      where: { orderId: id },
      _sum: { amount: true },
    });

    const cmv = order.items.reduce((sum, item) => sum + Number(item.unitCost) * item.quantity, 0);
    const marketplaceFeesTotal = Number(marketplaceFees._sum.amount ?? 0);
    const total = Number(order.total);
    const estimatedProfit = total - cmv - marketplaceFeesTotal;
    const marginPercent = total > 0 ? (estimatedProfit / total) * 100 : 0;

    return {
      id: order.id,
      channel: order.channel,
      externalOrderId: order.externalOrderId,
      externalStatus: order.externalStatus,
      integrationSyncStatus: order.integrationSyncStatus,
      integrationIssue: order.integrationIssue,
      customerName: order.customerName,
      customerDocument: order.customerDocument,
      status: order.status,
      orderDate: order.orderDate,
      subtotal: order.subtotal,
      discount: order.discount,
      shipping: order.shipping,
      total: order.total,
      paymentMethod: order.paymentMethod,
      notes: order.notes,
      items: order.items.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        sku: item.skuAtSale,
        productName: item.productNameAtSale,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        sellerDiscount: item.sellerDiscount,
        platformDiscount: item.platformDiscount,
        shippingRevenue: item.shippingRevenue,
        shippingCost: item.shippingCost,
        marketplaceFee: item.marketplaceFee,
        unitCost: item.unitCost,
        lineTotal:
          Number(item.unitPrice) * item.quantity - Number(item.sellerDiscount) - Number(item.platformDiscount),
      })),
      payments: order.payments,
      statusHistory: order.statusHistory,
      fiscalDocuments: order.fiscalDocuments,
      cmv: Math.round(cmv * 100) / 100,
      marketplaceFeesTotal: Math.round(marketplaceFeesTotal * 100) / 100,
      estimatedProfit: Math.round(estimatedProfit * 100) / 100,
      marginPercent: Math.round(marginPercent * 100) / 100,
    };
  }

  async updateStatus(id: string, companyId: string, userId: string, dto: UpdateOrderStatusDto) {
    const existing = await this.prisma.client.order.findFirst({
      where: { id, companyId },
      include: { items: true },
    });
    if (!existing) throw new NotFoundException('Pedido não encontrado');

    assertValidTransition(existing.status, dto.status);

    if (dto.status === OrderStatus.CANCELLED && !dto.note?.trim()) {
      throw new BadRequestException('Informe o motivo do cancelamento');
    }

    const updated = await this.prisma.client.$transaction(async (tx) => {
      // Cancelamento após o envio (estoque já baixado) NÃO gera retorno automático de
      // estoque — isso exige uma devolução explícita com `restockOnReturn` (seção 17-18).
      await this.applyStockEffectsForTransition(
        tx,
        { companyId, userId, referenceId: existing.id, reason: dto.note ?? undefined },
        existing.items,
        existing.status,
        dto.status,
      );

      const order = await tx.order.update({ where: { id }, data: { status: dto.status } });
      await tx.orderStatusHistory.create({
        data: { orderId: id, status: dto.status, changedBy: userId, note: dto.note ?? null },
      });
      return order;
    });

    return { old: existing, updated };
  }

  /**
   * Efeito de estoque de uma transição de status em um pedido JÁ EXISTENTE (seção 14-15) —
   * única implementação, usada tanto pela atualização manual (`updateStatus`, transição
   * validada estritamente) quanto pela sincronização externa (`applyExternalStatusUpdate`,
   * que pode "pular" estágios que o canal externo não relata granularmente). Itens sem
   * `variantId` (SKU externo ainda não vinculado) nunca geram movimento de estoque.
   */
  private async applyStockEffectsForTransition(
    tx: Prisma.TransactionClient,
    ctx: { companyId: string; userId?: string | null; referenceId: string; reason?: string },
    items: ImportItemLike[],
    fromStatus: OrderStatus,
    toStatus: OrderStatus,
  ): Promise<void> {
    if (fromStatus === toStatus) return;
    const fromPreShipment = isPreShipmentStatus(fromStatus);

    for (const item of items) {
      if (!item.variantId) continue;
      const movementCtx: MovementContext = {
        companyId: ctx.companyId,
        variantId: item.variantId,
        referenceType: 'order',
        referenceId: ctx.referenceId,
        userId: ctx.userId,
        reason: ctx.reason,
      };

      if (fromPreShipment && toStatus === OrderStatus.CANCELLED) {
        await this.ledger.release(tx, { ...movementCtx, reason: ctx.reason ?? 'Cancelamento antes do envio' }, item.quantity);
      } else if (fromPreShipment && !isPreShipmentStatus(toStatus)) {
        await this.ledger.commitSale(
          tx,
          { ...movementCtx, reason: ctx.reason ?? 'Baixa de estoque no envio do pedido' },
          item.quantity,
          true,
        );
      }
      // fromPreShipment && toStatus ainda pré-envio: nada a fazer, reserva já existe.
      // !fromPreShipment: estoque já saiu (ou pedido chegou histórico pós-envio) — qualquer
      // avanço adicional (DELIVERED, RETURN_REQUESTED, RETURNED, REFUNDED...) nunca mexe em
      // estoque de novo; isso é responsabilidade exclusiva do fluxo de devolução (seção 18).
    }
  }

  /**
   * Efeito de estoque na CRIAÇÃO de um pedido (seção 18 — "historical import" separado de
   * "live state transition"): usado tanto pela venda manual quanto pela importação de pedidos
   * externos cujo primeiro status observado já pode ser SHIPPED ou posterior. Nunca repete
   * transições intermediárias — aplica o efeito final de uma vez.
   *
   * `skipPhysicalDebit`: só suprime a baixa FÍSICA (`commitSale`, que decrementa `onHand`) de um
   * pedido histórico já enviado/entregue — o estoque atual já foi ressincronizado do canal
   * externo e já reflete essa venda antiga; debitar de novo levaria o saldo físico a negativo
   * (confirmado em produção). `reserve` nunca decrementa `onHand` (só marca unidades como
   * reservadas dentro do saldo físico já sincronizado), então um pedido histórico que AINDA está
   * pré-envio (aguardando pagamento/envio) sempre é reservado normalmente, mesmo numa carga
   * retroativa — do contrário um pedido em aberto encontrado no backfill nunca protegeria a
   * unidade contra ser vendida de novo (furo de estoque que este parâmetro existe para evitar).
   */
  private async initializeStockForNewOrder(
    tx: Prisma.TransactionClient,
    ctx: { companyId: string; userId?: string | null; referenceId: string; reason: string },
    items: ImportItemLike[],
    initialStatus: OrderStatus,
    options?: { skipPhysicalDebit?: boolean },
  ): Promise<void> {
    if (initialStatus === OrderStatus.CANCELLED) return;
    const preShipment = isPreShipmentStatus(initialStatus);

    for (const item of items) {
      if (!item.variantId) continue;
      const movementCtx: MovementContext = {
        companyId: ctx.companyId,
        variantId: item.variantId,
        referenceType: 'order',
        referenceId: ctx.referenceId,
        userId: ctx.userId,
        reason: ctx.reason,
      };
      if (preShipment) {
        await this.ledger.reserve(tx, movementCtx, item.quantity);
      } else if (!options?.skipPhysicalDebit) {
        await this.ledger.commitSale(tx, movementCtx, item.quantity, false);
      }
    }
  }

  /**
   * Resolve o vínculo de um SKU externo contra `channel_product_mappings` (seção 12) — só
   * considera vínculos já confirmados (CONFIRMED/AUTO_MATCHED); REVIEW_REQUIRED/PENDING/IGNORED
   * nunca resolvem sozinhos um item de pedido, pois isso poderia mover estoque para o produto
   * interno errado.
   */
  private async resolveMapping(
    tx: Prisma.TransactionClient,
    channelId: string,
    externalSku: string,
  ): Promise<{ variantId: string; sku: string; productName: string; cost: number } | null> {
    const mapping = await tx.channelProductMapping.findFirst({
      where: {
        channelId,
        externalSku,
        syncStatus: { in: [ChannelMappingSyncStatus.CONFIRMED, ChannelMappingSyncStatus.AUTO_MATCHED] },
      },
      include: {
        variant: {
          include: { product: { select: { name: true } }, costHistory: { orderBy: { effectiveDate: 'desc' }, take: 1 } },
        },
      },
    });
    // Um mapping CONFIRMED/AUTO_MATCHED sempre tem variantId por convenção de aplicação (só
    // quem cria essas duas situações — TikTokProductsSyncService — preenche variantId), mas o
    // relacionamento é opcional no schema (para permitir PENDING/IGNORED sem variante); a
    // checagem abaixo é defensiva, não um caminho esperado.
    if (!mapping || !mapping.variant) return null;
    return {
      variantId: mapping.variant.id,
      sku: mapping.variant.sku,
      productName: mapping.variant.product.name,
      cost: Number(mapping.variant.costHistory[0]?.cost ?? 0),
    };
  }

  /**
   * Importa um pedido de um canal externo (seção 13-15-17-18 da Fase 3). Idempotente: se o
   * pedido já existe (mesma companyId/channelId/externalOrderId), delega para
   * `applyExternalStatusUpdate` em vez de duplicar. Nunca descarta um pedido por causa de SKU
   * sem vínculo — cria com `integrationSyncStatus: REQUIRES_MAPPING` e segue sem mexer no
   * estoque daquele item específico.
   */
  async importExternalOrder(
    companyId: string,
    channelId: string,
    userId: string | null,
    normalized: ExternalOrder,
    options?: { skipStockMovement?: boolean },
  ): Promise<{ orderId: string; created: boolean }> {
    const existing = await this.prisma.client.order.findUnique({
      where: {
        companyId_channelId_externalOrderId: {
          companyId,
          channelId,
          externalOrderId: normalized.externalOrderId,
        },
      },
      include: { items: true },
    });

    if (existing) {
      await this.applyExternalStatusUpdate(companyId, existing.id, userId, normalized);
      return { orderId: existing.id, created: false };
    }

    const statusKnown = KNOWN_ORDER_STATUSES.has(normalized.internalStatus);
    const initialStatus = statusKnown ? (normalized.internalStatus as OrderStatus) : OrderStatus.CREATED;

    const subtotal = normalized.items.reduce((sum, i) => sum + Number(i.unitPrice) * i.quantity, 0);
    const discount = normalized.items.reduce(
      (sum, i) => sum + Number(i.sellerDiscount ?? 0) + Number(i.platformDiscount ?? 0),
      0,
    );

    const orderId = await this.prisma.client.$transaction(async (tx) => {
      const resolvedItems = await Promise.all(
        normalized.items.map(async (item) => {
          const mapping = await this.resolveMapping(tx, channelId, item.externalSku);
          return { item, mapping };
        }),
      );
      const hasUnmapped = resolvedItems.some((r) => !r.mapping);

      const order = await tx.order.create({
        data: {
          companyId,
          channelId,
          externalOrderId: normalized.externalOrderId,
          customerName: normalized.customerName ?? null,
          status: initialStatus,
          externalStatus: normalized.status,
          externalUpdatedAt: normalized.externalUpdatedAt ?? null,
          integrationSyncStatus: !statusKnown ? 'ERROR' : hasUnmapped ? 'REQUIRES_MAPPING' : 'OK',
          integrationIssue: !statusKnown
            ? `Status externo desconhecido: "${normalized.status}" — revisão manual necessária.`
            : hasUnmapped
              ? 'Pedido importado, mas contém SKU sem vínculo interno.'
              : null,
          orderDate: normalized.orderDate,
          subtotal,
          discount,
          shipping: Number(normalized.shippingRevenue ?? 0),
          total: subtotal - discount + Number(normalized.shippingRevenue ?? 0),
          items: {
            create: resolvedItems.map(({ item, mapping }) => ({
              variantId: mapping?.variantId ?? null,
              externalSku: mapping ? null : item.externalSku,
              quantity: item.quantity,
              productNameAtSale: mapping?.productName ?? `SKU sem vínculo: ${item.externalSku}`,
              skuAtSale: mapping?.sku ?? item.externalSku,
              unitPrice: item.unitPrice,
              unitCost: mapping?.cost ?? 0,
              sellerDiscount: item.sellerDiscount ?? 0,
              platformDiscount: item.platformDiscount ?? 0,
              shippingRevenue: normalized.shippingRevenue ?? 0,
              shippingCost: normalized.shippingCost ?? 0,
              marketplaceFee: normalized.marketplaceFee ?? 0,
            })),
          },
        },
        include: { items: true },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: initialStatus,
          changedBy: userId,
          note: 'Importado do canal externo (histórico) — sem repetição de transições intermediárias.',
        },
      });

      // `skipStockMovement`: carga histórica de pedidos ANTIGOS (seção pedida pelo usuário) — só
      // suprime a baixa FÍSICA (ver comentário de `initializeStockForNewOrder`); um pedido do
      // backfill que ainda está pré-envio continua sendo reservado normalmente.
      if (statusKnown) {
        await this.initializeStockForNewOrder(
          tx,
          { companyId, userId, referenceId: order.id, reason: 'Importação de pedido externo' },
          order.items,
          initialStatus,
          { skipPhysicalDebit: options?.skipStockMovement },
        );
      }

      return order.id;
    });

    return { orderId, created: true };
  }

  /**
   * Atualização de status de um pedido JÁ IMPORTADO vinda de um canal externo (webhook ou
   * reconciliação) — seção 16/24. Nunca decide por conta própria uma transição regressiva
   * (evento fora de ordem): compara `externalUpdatedAt` e a posição no caminho linear antes de
   * aplicar. Diferente de `updateStatus`, não exige que a transição seja um passo único válido
   * na máquina de estados — o canal externo pode reportar diretamente um estágio mais avançado
   * que o rastreado internamente.
   */
  async applyExternalStatusUpdate(
    companyId: string,
    orderId: string,
    userId: string | null,
    normalized: ExternalOrder,
  ): Promise<{ applied: boolean; reason?: string }> {
    const existing = await this.prisma.client.order.findFirst({
      where: { id: orderId, companyId },
      include: { items: true },
    });
    if (!existing) throw new NotFoundException('Pedido não encontrado');

    if (
      normalized.externalUpdatedAt &&
      existing.externalUpdatedAt &&
      normalized.externalUpdatedAt.getTime() < existing.externalUpdatedAt.getTime()
    ) {
      return { applied: false, reason: 'Evento mais antigo que a última atualização já aplicada — ignorado.' };
    }

    const statusKnown = KNOWN_ORDER_STATUSES.has(normalized.internalStatus);
    const targetStatus = statusKnown ? (normalized.internalStatus as OrderStatus) : existing.status;

    if (statusKnown && targetStatus !== existing.status && isRegressiveExternalTransition(existing.status, targetStatus)) {
      return { applied: false, reason: `Transição regressiva ignorada: ${existing.status} → ${targetStatus}.` };
    }

    await this.prisma.client.$transaction(async (tx) => {
      if (statusKnown && targetStatus !== existing.status) {
        await this.applyStockEffectsForTransition(
          tx,
          { companyId, userId, referenceId: existing.id, reason: 'Atualização via canal externo' },
          existing.items,
          existing.status,
          targetStatus,
        );
        await tx.orderStatusHistory.create({
          data: {
            orderId: existing.id,
            status: targetStatus,
            changedBy: userId,
            note: 'Atualização de status via canal externo',
          },
        });
      }

      await tx.order.update({
        where: { id: existing.id },
        data: {
          status: targetStatus,
          externalStatus: normalized.status,
          externalUpdatedAt: normalized.externalUpdatedAt ?? existing.externalUpdatedAt,
          integrationIssue: !statusKnown
            ? `Status externo desconhecido: "${normalized.status}" — revisão manual necessária.`
            : existing.integrationSyncStatus === 'REQUIRES_MAPPING'
              ? existing.integrationIssue
              : null,
          integrationSyncStatus: !statusKnown
            ? 'ERROR'
            : existing.integrationSyncStatus === 'REQUIRES_MAPPING'
              ? 'REQUIRES_MAPPING'
              : 'OK',
        },
      });
    });

    return { applied: true };
  }

  /**
   * "Reprocessar pedido" (seção 15): depois que o usuário resolve o vínculo de um SKU antes
   * sem mapeamento, tenta novamente resolver cada item pendente e aplica o efeito de estoque
   * apropriado ao status ATUAL do pedido — sem repetir movimentos já feitos para itens que já
   * estavam mapeados.
   */
  async reprocessOrder(orderId: string, companyId: string, userId: string): Promise<{ resolvedItems: number }> {
    const order = await this.prisma.client.order.findFirst({
      where: { id: orderId, companyId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');

    const pendingItems = order.items.filter((i) => !i.variantId && i.externalSku);
    if (pendingItems.length === 0) {
      return { resolvedItems: 0 };
    }

    let resolvedCount = 0;
    await this.prisma.client.$transaction(async (tx) => {
      for (const item of pendingItems) {
        const mapping = await this.resolveMapping(tx, order.channelId, item.externalSku!);
        if (!mapping) continue;

        await tx.orderItem.update({
          where: { id: item.id },
          data: {
            variantId: mapping.variantId,
            externalSku: null,
            productNameAtSale: mapping.productName,
            skuAtSale: mapping.sku,
            unitCost: mapping.cost,
          },
        });

        if (order.status !== OrderStatus.CANCELLED) {
          await this.initializeStockForNewOrder(
            tx,
            { companyId, userId, referenceId: order.id, reason: 'Reprocessamento após vínculo de SKU' },
            [{ variantId: mapping.variantId, quantity: item.quantity }],
            order.status,
          );
        }
        resolvedCount++;
      }

      const stillPending = await tx.orderItem.count({ where: { orderId: order.id, variantId: null } });
      if (stillPending === 0) {
        await tx.order.update({
          where: { id: order.id },
          data: { integrationSyncStatus: 'OK', integrationIssue: null },
        });
      }
    });

    return { resolvedItems: resolvedCount };
  }

  async createManualSale(companyId: string, userId: string, dto: CreateManualOrderDto) {
    const channel = await this.prisma.client.salesChannel.findFirst({
      where: { companyId, type: dto.channelType as ChannelType, isManual: true },
    });
    if (!channel) {
      throw new BadRequestException(
        `Canal manual do tipo ${dto.channelType} não está cadastrado para esta empresa`,
      );
    }

    const variantIds = dto.items.map((i) => i.variantId);
    const variants = await this.prisma.client.productVariant.findMany({
      where: { id: { in: variantIds }, product: { companyId } },
      include: {
        product: { select: { name: true } },
        costHistory: { orderBy: { effectiveDate: 'desc' }, take: 1 },
      },
    });
    if (variants.length !== new Set(variantIds).size) {
      throw new BadRequestException('Uma ou mais variantes informadas não foram encontradas');
    }
    const variantById = new Map(variants.map((v) => [v.id, v]));

    const subtotal = dto.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity - (item.discount ?? 0),
      0,
    );
    const shipping = dto.shipping ?? 0;
    const total = subtotal + shipping;
    const status = dto.status ?? OrderStatus.CREATED;
    const preShipment = isPreShipmentStatus(status);

    const orderId = await this.prisma.client.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          companyId,
          channelId: channel.id,
          externalOrderId: null,
          customerName: dto.customerName,
          status,
          orderDate: new Date(dto.orderDate),
          subtotal,
          discount: dto.items.reduce((sum, i) => sum + (i.discount ?? 0), 0),
          shipping,
          total,
          paymentMethod: dto.paymentMethod ?? null,
          notes: dto.notes ?? null,
          items: {
            create: dto.items.map((item) => {
              const variant = variantById.get(item.variantId)!;
              return {
                variantId: item.variantId,
                quantity: item.quantity,
                productNameAtSale: variant.product.name,
                skuAtSale: variant.sku,
                unitPrice: item.unitPrice,
                sellerDiscount: item.discount ?? 0,
                unitCost: Number(variant.costHistory[0]?.cost ?? 0),
              };
            }),
          },
        },
      });

      await tx.orderStatusHistory.create({
        data: { orderId: order.id, status, changedBy: userId },
      });

      if (status !== OrderStatus.CANCELLED) {
        for (const item of dto.items) {
          const movementCtx = {
            companyId,
            variantId: item.variantId,
            referenceType: 'order',
            referenceId: order.id,
            userId,
            reason: `Venda manual — ${dto.channelType}`,
          };
          if (preShipment) {
            await this.ledger.reserve(tx, movementCtx, item.quantity);
          } else {
            await this.ledger.commitSale(tx, movementCtx, item.quantity, false);
          }
        }
      }

      return order.id;
    });

    return this.findOne(orderId, companyId);
  }
}
