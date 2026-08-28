import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, RefundType } from '@ecommerce-manager/database';
import { PrismaService } from '../common/prisma/prisma.service';
import { paginate } from '../common/dto/pagination.dto';
import { InventoryLedgerService } from '../inventory/ledger.service';
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

    const orderItemsById = new Map(order.items.map((i) => [i.id, i]));
    for (const item of dto.items) {
      const orderItem = orderItemsById.get(item.orderItemId);
      if (!orderItem) {
        throw new BadRequestException(`O item ${item.orderItemId} não pertence a este pedido`);
      }
      if (item.quantity > orderItem.quantity) {
        throw new BadRequestException(
          `Quantidade devolvida (${item.quantity}) maior que a quantidade vendida (${orderItem.quantity}) para ${orderItem.skuAtSale}`,
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
