import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ChannelType, OrderStatus, Prisma } from '@ecommerce-manager/database';
import { PrismaService } from '../common/prisma/prisma.service';
import { paginate } from '../common/dto/pagination.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CreateManualOrderDto } from './dto/create-manual-order.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, query: QueryOrdersDto) {
    const where: Prisma.OrderWhereInput = {
      companyId,
      ...(query.channelId ? { channelId: query.channelId } : {}),
      ...(query.status ? { status: query.status } : {}),
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
    }));

    return paginate(items, total, query.page, query.pageSize);
  }

  async findOne(id: string, companyId: string) {
    const order = await this.prisma.client.order.findFirst({
      where: { id, companyId },
      include: {
        channel: { select: { id: true, name: true, type: true } },
        items: { include: { variant: { select: { sku: true, product: { select: { name: true } } } } } },
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
        sku: item.variant.sku,
        productName: item.variant.product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
        unitCost: item.unitCost,
        lineTotal: Number(item.unitPrice) * item.quantity - Number(item.discount),
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
    const existing = await this.prisma.client.order.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Pedido não encontrado');

    const [updated] = await this.prisma.client.$transaction([
      this.prisma.client.order.update({ where: { id }, data: { status: dto.status } }),
      this.prisma.client.orderStatusHistory.create({
        data: { orderId: id, status: dto.status, changedBy: userId, note: dto.note ?? null },
      }),
    ]);

    return { old: existing, updated };
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
      include: { costHistory: { orderBy: { effectiveDate: 'desc' }, take: 1 } },
    });
    if (variants.length !== new Set(variantIds).size) {
      throw new BadRequestException('Uma ou mais variantes informadas não foram encontradas');
    }
    const costByVariant = new Map(variants.map((v) => [v.id, Number(v.costHistory[0]?.cost ?? 0)]));

    const subtotal = dto.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity - (item.discount ?? 0),
      0,
    );
    const shipping = dto.shipping ?? 0;
    const total = subtotal + shipping;
    const status = dto.status ?? OrderStatus.CREATED;

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
            create: dto.items.map((item) => ({
              variantId: item.variantId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount ?? 0,
              unitCost: costByVariant.get(item.variantId) ?? 0,
            })),
          },
        },
      });

      await tx.orderStatusHistory.create({
        data: { orderId: order.id, status, changedBy: userId },
      });

      if (status !== OrderStatus.CANCELLED) {
        for (const item of dto.items) {
          const inventory = await tx.inventory.findFirst({ where: { variantId: item.variantId } });
          const nextAvailable = Math.max((inventory?.available ?? 0) - item.quantity, 0);

          await tx.inventoryMovement.create({
            data: {
              companyId,
              variantId: item.variantId,
              type: 'SALE',
              quantity: -item.quantity,
              reference: order.id,
              note: `Venda manual — ${dto.channelType}`,
              createdBy: userId,
            },
          });

          if (inventory) {
            await tx.inventory.update({
              where: { variantId: item.variantId },
              data: { available: nextAvailable },
            });
          } else {
            await tx.inventory.create({
              data: { companyId, variantId: item.variantId, available: 0, reserved: 0 },
            });
          }
        }
      }

      return order.id;
    });

    return this.findOne(orderId, companyId);
  }
}
