import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@ecommerce-manager/database';
import { PrismaService } from '../common/prisma/prisma.service';
import { paginate } from '../common/dto/pagination.dto';
import { QueryInventoryDto } from './dto/query-inventory.dto';
import { QueryMovementsDto } from './dto/query-movements.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { InventoryLedgerService } from './ledger.service';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: InventoryLedgerService,
  ) {}

  async findAll(companyId: string, query: QueryInventoryDto) {
    const where: Prisma.InventoryWhereInput = {
      companyId,
      ...(query.search
        ? {
            variant: {
              OR: [
                { sku: { contains: query.search, mode: 'insensitive' as const } },
                { product: { name: { contains: query.search, mode: 'insensitive' as const } } },
              ],
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.client.inventory.findMany({
        where,
        include: {
          variant: {
            include: {
              product: { select: { name: true } },
              costHistory: { orderBy: { effectiveDate: 'desc' }, take: 1 },
            },
          },
        },
        orderBy: { variant: { sku: 'asc' } },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.inventory.count({ where }),
    ]);

    let items = rows.map((row) => {
      const latestCost = row.variant.costHistory[0]?.cost ?? null;
      const available = row.onHand - row.reserved;
      const belowMinimum = available < row.variant.minStock;
      return {
        variantId: row.variantId,
        sku: row.variant.sku,
        productName: row.variant.product.name,
        onHand: row.onHand,
        available,
        reserved: row.reserved,
        minStock: row.variant.minStock,
        belowMinimum,
        estimatedValue: latestCost ? Number(latestCost) * row.onHand : 0,
      };
    });

    if (query.belowMinimumOnly) {
      items = items.filter((i) => i.belowMinimum);
    }

    return paginate(items, total, query.page, query.pageSize);
  }

  async getSummary(companyId: string) {
    const rows = await this.prisma.client.inventory.findMany({
      where: { companyId },
      include: {
        variant: {
          select: {
            minStock: true,
            costHistory: { orderBy: { effectiveDate: 'desc' }, take: 1 },
          },
        },
      },
    });

    let totalUnits = 0;
    let estimatedValue = 0;
    let belowMinimumCount = 0;

    for (const row of rows) {
      totalUnits += row.onHand;
      const latestCost = row.variant.costHistory[0]?.cost;
      if (latestCost) estimatedValue += Number(latestCost) * row.onHand;
      const available = row.onHand - row.reserved;
      if (available < row.variant.minStock) belowMinimumCount += 1;
    }

    return {
      totalSkus: rows.length,
      totalUnits,
      estimatedValue: Math.round(estimatedValue * 100) / 100,
      belowMinimumCount,
    };
  }

  async listMovements(companyId: string, query: QueryMovementsDto) {
    const where: Prisma.InventoryMovementWhereInput = {
      companyId,
      ...(query.variantId ? { variantId: query.variantId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.client.inventoryMovement.findMany({
        where,
        include: { variant: { include: { product: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.inventoryMovement.count({ where }),
    ]);

    const items = rows.map((row) => ({
      id: row.id,
      variantId: row.variantId,
      sku: row.variant.sku,
      productName: row.variant.product.name,
      type: row.type,
      quantity: row.quantity,
      previousOnHand: row.previousOnHand,
      newOnHand: row.newOnHand,
      previousReserved: row.previousReserved,
      newReserved: row.newReserved,
      referenceType: row.referenceType,
      referenceId: row.referenceId,
      reason: row.reason,
      note: row.note,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
    }));

    return paginate(items, total, query.page, query.pageSize);
  }

  async createMovement(companyId: string, userId: string, dto: CreateMovementDto) {
    const variant = await this.prisma.client.productVariant.findFirst({
      where: { id: dto.variantId, product: { companyId } },
    });
    if (!variant) {
      throw new NotFoundException('Variante não encontrada');
    }

    return this.prisma.client.$transaction(async (tx) => {
      const ctx = {
        companyId,
        variantId: dto.variantId,
        referenceType: 'manual_adjustment',
        referenceId: dto.variantId,
        userId,
        reason: dto.reason,
        note: dto.note,
      };

      switch (dto.type) {
        case 'ADJUSTMENT':
          return this.ledger.adjust(tx, ctx, dto.quantity);
        case 'DAMAGE':
        case 'LOSS':
          return this.ledger.writeOff(tx, ctx, dto.quantity, dto.type);
        case 'RESERVATION':
          return this.ledger.reserve(tx, ctx, dto.quantity);
        case 'RELEASE':
          return this.ledger.release(tx, ctx, dto.quantity);
      }
    });
  }
}
