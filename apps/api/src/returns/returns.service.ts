import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@ecommerce-manager/database';
import { PrismaService } from '../common/prisma/prisma.service';
import { paginate } from '../common/dto/pagination.dto';
import { QueryReturnsDto } from './dto/query-returns.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { UpdateReturnStatusDto } from './dto/update-return-status.dto';

@Injectable()
export class ReturnsService {
  constructor(private readonly prisma: PrismaService) {}

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
        order: { select: { id: true, customerName: true } },
        items: {
          include: {
            orderItem: {
              include: { variant: { select: { sku: true, product: { select: { name: true } } } } },
            },
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

    const orderItemIds = new Set(order.items.map((i) => i.id));
    for (const item of dto.items) {
      if (!orderItemIds.has(item.orderItemId)) {
        throw new BadRequestException(
          `O item ${item.orderItemId} não pertence a este pedido`,
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
            })),
          },
        },
      });

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
}
