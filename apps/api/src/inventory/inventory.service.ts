import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryMovementType, Prisma } from '@ecommerce-manager/database';
import { PrismaService } from '../common/prisma/prisma.service';
import { paginate } from '../common/dto/pagination.dto';
import { QueryInventoryDto } from './dto/query-inventory.dto';
import { QueryMovementsDto } from './dto/query-movements.dto';
import { CreateMovementDto } from './dto/create-movement.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

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
      const belowMinimum = row.available < row.variant.minStock;
      return {
        variantId: row.variantId,
        sku: row.variant.sku,
        productName: row.variant.product.name,
        available: row.available,
        reserved: row.reserved,
        minStock: row.variant.minStock,
        belowMinimum,
        estimatedValue: latestCost ? Number(latestCost) * row.available : 0,
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
      totalUnits += row.available;
      const latestCost = row.variant.costHistory[0]?.cost;
      if (latestCost) estimatedValue += Number(latestCost) * row.available;
      if (row.available < row.variant.minStock) belowMinimumCount += 1;
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
      reference: row.reference,
      note: row.note,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
    }));

    return paginate(items, total, query.page, query.pageSize);
  }

  async createMovement(companyId: string, userId: string, dto: CreateMovementDto) {
    return this.prisma.client.$transaction(async (tx) => {
      const inventory = await tx.inventory.findFirst({
        where: { variantId: dto.variantId, companyId },
      });
      if (!inventory) {
        throw new NotFoundException('Estoque da variante não encontrado');
      }

      let availableDelta = 0;
      let reservedDelta = 0;
      let storedQuantity = dto.quantity;

      switch (dto.type) {
        case 'ADJUSTMENT': {
          availableDelta = dto.quantity;
          break;
        }
        case 'DAMAGE':
        case 'LOSS': {
          if (dto.quantity <= 0) {
            throw new BadRequestException('quantity deve ser positivo para este tipo de movimentação');
          }
          if (inventory.available - dto.quantity < 0) {
            throw new BadRequestException('Quantidade disponível insuficiente para esta baixa');
          }
          availableDelta = -dto.quantity;
          storedQuantity = -dto.quantity;
          break;
        }
        case 'RESERVATION': {
          if (dto.quantity <= 0) {
            throw new BadRequestException('quantity deve ser positivo para este tipo de movimentação');
          }
          if (inventory.available - dto.quantity < 0) {
            throw new BadRequestException('Quantidade disponível insuficiente para reservar');
          }
          availableDelta = -dto.quantity;
          reservedDelta = dto.quantity;
          break;
        }
        case 'RELEASE': {
          if (dto.quantity <= 0) {
            throw new BadRequestException('quantity deve ser positivo para este tipo de movimentação');
          }
          if (inventory.reserved - dto.quantity < 0) {
            throw new BadRequestException('Quantidade reservada insuficiente para liberar');
          }
          availableDelta = dto.quantity;
          reservedDelta = -dto.quantity;
          break;
        }
      }

      if (inventory.available + availableDelta < 0) {
        throw new BadRequestException('Esta movimentação deixaria o estoque disponível negativo');
      }

      const updatedInventory = await tx.inventory.update({
        where: { variantId: dto.variantId },
        data: {
          available: inventory.available + availableDelta,
          reserved: inventory.reserved + reservedDelta,
        },
      });

      const movement = await tx.inventoryMovement.create({
        data: {
          companyId,
          variantId: dto.variantId,
          type: dto.type as InventoryMovementType,
          quantity: storedQuantity,
          note: dto.note ?? null,
          createdBy: userId,
        },
      });

      return { movement, inventory: updatedInventory };
    });
  }
}
