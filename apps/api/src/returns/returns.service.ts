import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, RefundType, ReturnStatus } from '@ecommerce-manager/database';
import { PrismaService } from '../common/prisma/prisma.service';
import { paginate } from '../common/dto/pagination.dto';
import { InventoryLedgerService } from '../inventory/ledger.service';
import { assertValidTransition } from '../orders/order-state-machine';
import { QueryReturnsDto } from './dto/query-returns.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { UpdateReturnStatusDto } from './dto/update-return-status.dto';
import { CreateRefundDto } from './dto/create-refund.dto';

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: InventoryLedgerService,
  ) {}

  async findAll(companyId: string, query: QueryReturnsDto) {
    const where: Prisma.ReturnWhereInput = {
      order: { companyId },
      ...(query.status ? { status: query.status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.client.return.findMany({
        where,
        include: { order: { include: { channel: { select: { name: true } } } } },
        orderBy: { requestedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.return.count({ where }),
    ]);

    const items = rows.map((row) => ({
      id: row.id,
      orderId: row.orderId,
      customerName: row.order.customerName,
      channelName: row.order.channel.name,
      reason: row.reason,
      status: row.status,
      requestedAt: row.requestedAt,
    }));

    return paginate(items, total, query.page, query.pageSize);
  }

  async findOne(id: string, companyId: string) {
    const ret = await this.prisma.client.return.findFirst({
      where: { id, order: { companyId } },
      include: {
        order: { select: { id: true, customerName: true, total: true } },
        items: {
          include: {
            // sku/nome vêm do snapshot da venda (skuAtSale/productNameAtSale) — nunca da
            // variante atual, que pode nem existir mais para itens importados sem vínculo
            // (seção 15 da Fase 3).
            orderItem: true,
          },
        },
        refunds: true,
      },
    });
    if (!ret) throw new NotFoundException('Devolução não encontrada');
    return ret;
  }

  async create(orderId: string, companyId: string, userId: string, dto: CreateReturnDto) {
    const order = await this.prisma.client.order.findFirst({
      where: { id: orderId, companyId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');

    // Um pedido que nunca chegou a ser enviado não pode ter devolução aberta contra ele — antes
    // nada checava isso, então dava pra abrir devolução (e, na sequência, reembolso) num pedido
    // ainda CREATED/PAID/PROCESSING.
    assertValidTransition(order.status, OrderStatus.RETURN_REQUESTED);

    const orderItemsById = new Map(order.items.map((i) => [i.id, i]));

    // Soma quanto já foi devolvido de cada item em devoluções ANTERIORES (não rejeitadas) —
    // sem isso, duas devoluções separadas (ou duas linhas iguais na mesma requisição) do mesmo
    // item conseguiam, juntas, devolver mais unidades do que foram vendidas, e — pior — repor
    // estoque em dobro quando ambas marcassem `restockOnReturn`.
    const orderItemIds = dto.items.map((i) => i.orderItemId);
    const priorReturnItems = await this.prisma.client.returnItem.findMany({
      where: {
        orderItemId: { in: orderItemIds },
        return: { orderId, status: { not: ReturnStatus.REJECTED } },
      },
      select: { orderItemId: true, quantity: true },
    });
    const alreadyReturnedByItem = new Map<string, number>();
    for (const ri of priorReturnItems) {
      alreadyReturnedByItem.set(ri.orderItemId, (alreadyReturnedByItem.get(ri.orderItemId) ?? 0) + ri.quantity);
    }

    // Também soma as linhas dentro desta MESMA requisição — sem isso, listar o mesmo
    // orderItemId duas vezes numa única chamada contornava a checagem acima.
    const requestedByItem = new Map<string, number>();
    for (const item of dto.items) {
      requestedByItem.set(item.orderItemId, (requestedByItem.get(item.orderItemId) ?? 0) + item.quantity);
    }

    for (const [orderItemId, requestedQuantity] of requestedByItem) {
      const orderItem = orderItemsById.get(orderItemId);
      if (!orderItem) {
        throw new BadRequestException(`O item ${orderItemId} não pertence a este pedido`);
      }
      const alreadyReturned = alreadyReturnedByItem.get(orderItemId) ?? 0;
      const remaining = orderItem.quantity - alreadyReturned;
      if (requestedQuantity > remaining) {
        throw new BadRequestException(
          `Quantidade devolvida (${requestedQuantity}) maior que a quantidade ainda devolvível (${remaining} de ${orderItem.quantity} vendida(s), ${alreadyReturned} já devolvida(s) antes) para ${orderItem.skuAtSale}`,
        );
      }
    }

    const returnId = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.return.create({
        data: {
          orderId,
          reason: dto.reason ?? null,
          items: {
            create: dto.items.map((item) => ({
              orderItemId: item.orderItemId,
              quantity: item.quantity,
              condition: item.condition ?? null,
              restockOnReturn: item.restockOnReturn ?? false,
            })),
          },
        },
        include: { items: true },
      });

      // Estoque só retorna quando explicitamente marcado (seção 18) — nunca automático.
      for (const returnItem of created.items) {
        if (!returnItem.restockOnReturn) continue;
        const orderItem = orderItemsById.get(returnItem.orderItemId)!;
        if (!orderItem.variantId) {
          throw new BadRequestException(
            `O item ${orderItem.skuAtSale} ainda não tem um produto interno vinculado — resolva o vínculo antes de marcar retorno ao estoque.`,
          );
        }
        await this.ledger.restock(
          tx,
          {
            companyId,
            variantId: orderItem.variantId,
            referenceType: 'return',
            referenceId: created.id,
            userId,
            reason: dto.reason ?? 'Devolução com retorno ao estoque',
          },
          returnItem.quantity,
        );
      }

      await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.RETURN_REQUESTED } });
      await tx.orderStatusHistory.create({
        data: { orderId, status: OrderStatus.RETURN_REQUESTED, changedBy: userId },
      });

      return created.id;
    });

    return this.findOne(returnId, companyId);
  }

  async updateStatus(id: string, companyId: string, dto: UpdateReturnStatusDto) {
    const existing = await this.prisma.client.return.findFirst({
      where: { id, order: { companyId } },
    });
    if (!existing) throw new NotFoundException('Devolução não encontrada');

    const updated = await this.prisma.client.return.update({
      where: { id },
      data: {
        status: dto.status,
        resolvedAt: dto.resolvedAt ? new Date(dto.resolvedAt) : undefined,
      },
    });

    return { old: existing, updated };
  }

  /**
   * Reembolso financeiro — deliberadamente separado do retorno físico da mercadoria
   * (seção 19). Marcar um refund como processado nunca, por si só, gera InventoryMovement.
   */
  async createRefund(returnId: string, companyId: string, userId: string, dto: CreateRefundDto) {
    const ret = await this.prisma.client.return.findFirst({
      where: { id: returnId, order: { companyId } },
      include: { order: true },
    });
    if (!ret) throw new NotFoundException('Devolução não encontrada');
    if (ret.status === 'REJECTED') {
      throw new BadRequestException('Não é possível reembolsar uma devolução rejeitada');
    }

    const orderStatus = dto.type === RefundType.FULL ? OrderStatus.REFUNDED : OrderStatus.PARTIALLY_REFUNDED;
    assertValidTransition(ret.order.status, orderStatus);

    // Soma todo reembolso PROCESSED já lançado pra este pedido (em qualquer devolução dele, não
    // só nesta) — sem isso, nada impedia dois reembolsos "totais" seguidos (ex.: duplo clique)
    // dobrarem o valor reembolsado registrado. Pequena tolerância de arredondamento (1 centavo).
    const priorRefunds = await this.prisma.client.refund.aggregate({
      where: { status: 'PROCESSED', return: { orderId: ret.orderId } },
      _sum: { amount: true },
    });
    const alreadyRefunded = Number(priorRefunds._sum.amount ?? 0);
    const orderTotal = Number(ret.order.total);
    if (alreadyRefunded + dto.amount > orderTotal + 0.01) {
      throw new BadRequestException(
        `Reembolso de R$ ${dto.amount.toFixed(2)} excede o valor ainda reembolsável (R$ ${(orderTotal - alreadyRefunded).toFixed(2)} restante de R$ ${orderTotal.toFixed(2)}, R$ ${alreadyRefunded.toFixed(2)} já reembolsado).`,
      );
    }

    const refund = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.refund.create({
        data: {
          returnId,
          type: dto.type,
          amount: dto.amount,
          method: dto.method ?? null,
          externalReference: dto.externalReference ?? null,
          status: 'PROCESSED',
          processedAt: new Date(),
        },
      });

      await tx.order.update({ where: { id: ret.orderId }, data: { status: orderStatus } });
      await tx.orderStatusHistory.create({
        data: { orderId: ret.orderId, status: orderStatus, changedBy: userId, note: `Reembolso ${dto.type}` },
      });

      return created;
    });

    return refund;
  }

  /**
   * Upsert idempotente de uma devolução vinda de um canal externo (seção 34-35 da Fase 3).
   * "RETURNED no TikTok" nunca significa automaticamente "apto ao estoque" — por isso os itens
   * (quando o payload externo permite identificá-los com segurança) sempre entram com
   * `condition: null` e `restockOnReturn: false`; a decisão de restock continua exigindo
   * intervenção manual (seção 36), mesmo para devoluções sincronizadas. Quando o item não pôde
   * ser identificado com segurança no payload externo, a devolução é criada só com o cabeçalho
   * (sem itens) para completude manual posterior — nunca inventamos qual item foi devolvido.
   */
  async upsertFromExternal(
    orderId: string,
    external: {
      externalReturnId: string;
      externalStatus: string;
      reason?: string;
      items: Array<{ orderItemId: string; quantity: number }>;
    },
  ): Promise<{ returnId: string; created: boolean }> {
    const existing = await this.prisma.client.return.findUnique({
      where: { orderId_externalReturnId: { orderId, externalReturnId: external.externalReturnId } },
    });

    if (existing) {
      await this.prisma.client.return.update({
        where: { id: existing.id },
        data: { externalStatus: external.externalStatus },
      });
      return { returnId: existing.id, created: false };
    }

    const created = await this.prisma.client.return.create({
      data: {
        orderId,
        reason: external.reason ?? null,
        externalReturnId: external.externalReturnId,
        externalStatus: external.externalStatus,
        items: {
          create: external.items.map((item) => ({
            orderItemId: item.orderItemId,
            quantity: item.quantity,
            condition: null,
            restockOnReturn: false,
          })),
        },
      },
    });

    return { returnId: created.id, created: true };
  }
}
