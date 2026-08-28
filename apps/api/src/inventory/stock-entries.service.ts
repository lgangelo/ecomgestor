import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@ecommerce-manager/database';
import { PrismaService } from '../common/prisma/prisma.service';
import { paginate } from '../common/dto/pagination.dto';
import { CreateStockEntryDto } from './dto/create-stock-entry.dto';
import { QueryStockEntriesDto } from './dto/query-stock-entries.dto';
import { InventoryLedgerService } from './ledger.service';
import { allocateCosts } from './cost-allocation.util';

@Injectable()
export class StockEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: InventoryLedgerService,
  ) {}

  async findAll(companyId: string, query: QueryStockEntriesDto) {
    const where: Prisma.StockEntryWhereInput = {
      companyId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.client.stockEntry.findMany({
        where,
        include: { supplier: { select: { name: true } }, _count: { select: { items: true } } },
        orderBy: { entryDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.stockEntry.count({ where }),
    ]);

    const items = rows.map((row) => ({
      id: row.id,
      entryDate: row.entryDate,
      supplierName: row.supplier?.name ?? null,
      invoiceNumber: row.invoiceNumber,
      status: row.status,
      itemCount: row._count.items,
    }));

    return paginate(items, total, query.page, query.pageSize);
  }

  async findOne(id: string, companyId: string) {
    const entry = await this.prisma.client.stockEntry.findFirst({
      where: { id, companyId },
      include: {
        supplier: { select: { id: true, name: true } },
        items: { include: { variant: { select: { sku: true, product: { select: { name: true } } } } } },
      },
    });
    if (!entry) throw new NotFoundException('Entrada de estoque não encontrada');

    return {
      id: entry.id,
      entryDate: entry.entryDate,
      invoiceNumber: entry.invoiceNumber,
      notes: entry.notes,
      shippingCost: entry.shippingCost,
      otherCosts: entry.otherCosts,
      allocationMethod: entry.allocationMethod,
      status: entry.status,
      supplier: entry.supplier,
      items: entry.items.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        sku: item.variant.sku,
        productName: item.variant.product.name,
        quantity: item.quantity,
        unitCost: item.unitCost,
        effectiveUnitCost: item.effectiveUnitCost,
      })),
    };
  }

  async create(companyId: string, userId: string, dto: CreateStockEntryDto) {
    const status = dto.status ?? 'DRAFT';
    const allocationMethod = dto.allocationMethod ?? 'BY_VALUE';
    const shippingCost = dto.shippingCost ?? 0;
    const otherCosts = dto.otherCosts ?? 0;

    const allocations = allocateCosts(
      dto.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity, unitCost: item.unitCost })),
      shippingCost + otherCosts,
      allocationMethod,
    );
    const effectiveCostByVariant = new Map(allocations.map((a) => [a.variantId, a.effectiveUnitCost]));

    const entryId = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.stockEntry.create({
        data: {
          companyId,
          supplierId: dto.supplierId ?? null,
          entryDate: new Date(dto.entryDate),
          invoiceNumber: dto.invoiceNumber ?? null,
          notes: dto.notes ?? null,
          shippingCost,
          otherCosts,
          allocationMethod,
          status: 'DRAFT',
          items: {
            create: dto.items.map((item) => ({
              variantId: item.variantId,
              quantity: item.quantity,
              unitCost: item.unitCost,
              effectiveUnitCost: effectiveCostByVariant.get(item.variantId) ?? item.unitCost,
            })),
          },
        },
        include: { items: true },
      });

      if (status === 'CONFIRMED') {
        await this.applyConfirmation(tx, companyId, userId, created.id, created.items);
      }

      return created.id;
    });

    return this.findOne(entryId, companyId);
  }

  async confirm(id: string, companyId: string, userId: string) {
    const entry = await this.prisma.client.stockEntry.findFirst({
      where: { id, companyId },
      include: { items: true },
    });
    if (!entry) throw new NotFoundException('Entrada de estoque não encontrada');
    if (entry.status !== 'DRAFT') {
      throw new BadRequestException('Apenas entradas em rascunho podem ser confirmadas');
    }

    await this.prisma.client.$transaction(async (tx) => {
      await this.applyConfirmation(tx, companyId, userId, entry.id, entry.items);
    });

    return this.findOne(id, companyId);
  }

  private async applyConfirmation(
    tx: Prisma.TransactionClient,
    companyId: string,
    userId: string,
    stockEntryId: string,
    items: Array<{ variantId: string; quantity: number; unitCost: Prisma.Decimal; effectiveUnitCost: Prisma.Decimal | null }>,
  ) {
    const entry = await tx.stockEntry.findFirstOrThrow({ where: { id: stockEntryId } });

    for (const item of items) {
      await this.ledger.purchase(
        tx,
        {
          companyId,
          variantId: item.variantId,
          referenceType: 'stock_entry',
          referenceId: stockEntryId,
          userId,
          note: entry.invoiceNumber ? `Confirmação de entrada — NF ${entry.invoiceNumber}` : 'Confirmação de entrada de estoque',
        },
        item.quantity,
      );

      const cost = item.effectiveUnitCost ?? item.unitCost;
      await tx.productCostHistory.create({
        data: {
          variantId: item.variantId,
          cost,
          effectiveDate: entry.entryDate,
          note:
            item.effectiveUnitCost && Number(item.effectiveUnitCost) !== Number(item.unitCost)
              ? `Custo com rateio de frete/despesas (entrada de estoque). Custo bruto: ${item.unitCost}`
              : 'Custo registrado a partir de entrada de estoque',
        },
      });
    }

    await tx.stockEntry.update({ where: { id: stockEntryId }, data: { status: 'CONFIRMED' } });
  }
}
