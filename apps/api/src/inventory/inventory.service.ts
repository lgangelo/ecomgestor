import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@ecommerce-manager/database';
import { PrismaService } from '../common/prisma/prisma.service';
import { paginate } from '../common/dto/pagination.dto';
import { QueryInventoryDto } from './dto/query-inventory.dto';
import { QueryMovementsDto } from './dto/query-movements.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { InventoryLedgerService } from './ledger.service';

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface SlowMovingItem {
  variantId: string;
  sku: string;
  productName: string;
  onHand: number;
  estimatedValue: number;
  lastSaleAt: string | null;
  daysSinceLastSale: number | null;
}

export interface RestockSuggestionItem {
  variantId: string;
  sku: string;
  productName: string;
  available: number;
  minStock: number;
  coverageDays: number | null;
  reason: 'below_minimum' | 'low_coverage';
}

export interface InventoryInsights {
  slowMovingDays: number;
  restockCoverageDays: number;
  slowMoving: SlowMovingItem[];
  restockSuggestions: RestockSuggestionItem[];
}

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
              // Desempate por createdAt — ver comentário equivalente em products.service.ts.
              costHistory: { orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }], take: 1 },
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
            // Desempate por createdAt — ver comentário equivalente em products.service.ts.
              costHistory: { orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }], take: 1 },
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

  /**
   * Estoque parado + sugestão de reposição (seções 33-36 da Fase 4) — gerencial e simples,
   * nunca uma previsão sofisticada. "Última venda" e "vendido nos últimos 30 dias" vêm de uma
   * única consulta agregada em SQL (o Prisma não expressa MAX/SUM de uma coluna da tabela
   * relacionada agrupado pela FK em uma única chamada tipada); os limites (dias parado, dias de
   * cobertura mínima) vêm da configuração da empresa (seção 65), nunca hardcoded.
   */
  async getInsights(companyId: string): Promise<InventoryInsights> {
    const company = await this.prisma.client.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { slowMovingDays: true, restockCoverageDays: true },
    });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [rows, salesSignalRows] = await Promise.all([
      this.prisma.client.inventory.findMany({
        where: { companyId },
        include: {
          variant: {
            select: {
              sku: true,
              minStock: true,
              product: { select: { name: true } },
              // Desempate por createdAt — ver comentário equivalente em products.service.ts.
              costHistory: { orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }], take: 1 },
            },
          },
        },
      }),
      this.prisma.client.$queryRaw<Array<{ variantId: string; lastSaleAt: Date | null; qty30d: number }>>(Prisma.sql`
        SELECT oi.variant_id AS "variantId",
               MAX(o.order_date) AS "lastSaleAt",
               COALESCE(SUM(CASE WHEN o.order_date >= ${thirtyDaysAgo} THEN oi.quantity ELSE 0 END), 0)::int AS "qty30d"
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.company_id = ${companyId} AND o.status != 'CANCELLED' AND oi.variant_id IS NOT NULL
        GROUP BY oi.variant_id
      `),
    ]);

    const signalsByVariant = new Map(salesSignalRows.map((s) => [s.variantId, s]));
    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();

    const slowMoving: SlowMovingItem[] = [];
    const restockSuggestions: RestockSuggestionItem[] = [];

    for (const row of rows) {
      if (row.onHand <= 0) continue; // seção 33: só entra quem tem estoque físico > 0
      const signal = signalsByVariant.get(row.variantId);
      const latestCost = row.variant.costHistory[0]?.cost ?? null;
      const estimatedValue = latestCost ? Number(latestCost) * row.onHand : 0;
      const lastSaleAt = signal?.lastSaleAt ?? null;
      const daysSinceLastSale = lastSaleAt ? Math.floor((now - lastSaleAt.getTime()) / dayMs) : null;

      if (daysSinceLastSale === null || daysSinceLastSale > company.slowMovingDays) {
        slowMoving.push({
          variantId: row.variantId,
          sku: row.variant.sku,
          productName: row.variant.product.name,
          onHand: row.onHand,
          estimatedValue: round2(estimatedValue),
          lastSaleAt: lastSaleAt ? lastSaleAt.toISOString() : null,
          daysSinceLastSale,
        });
      }

      const available = row.onHand - row.reserved;
      const avgDailySales = (signal?.qty30d ?? 0) / 30;
      // Sem venda nos últimos 30 dias: não inventa uma cobertura (seção 35 — "sem dados
      // suficientes"), mas ainda pode entrar na sugestão de reposição via belowMinimum.
      const coverageDays = avgDailySales > 0 ? round2(available / avgDailySales) : null;
      const belowMinimum = available <= row.variant.minStock;
      const lowCoverage = coverageDays !== null && coverageDays < company.restockCoverageDays;
      if (belowMinimum || lowCoverage) {
        restockSuggestions.push({
          variantId: row.variantId,
          sku: row.variant.sku,
          productName: row.variant.product.name,
          available,
          minStock: row.variant.minStock,
          coverageDays,
          reason: belowMinimum ? 'below_minimum' : 'low_coverage',
        });
      }
    }

    slowMoving.sort((a, b) => (b.daysSinceLastSale ?? Number.MAX_SAFE_INTEGER) - (a.daysSinceLastSale ?? Number.MAX_SAFE_INTEGER));
    restockSuggestions.sort((a, b) => (a.coverageDays ?? Number.MAX_SAFE_INTEGER) - (b.coverageDays ?? Number.MAX_SAFE_INTEGER));

    return {
      slowMovingDays: company.slowMovingDays,
      restockCoverageDays: company.restockCoverageDays,
      slowMoving,
      restockSuggestions,
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
