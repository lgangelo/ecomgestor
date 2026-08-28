import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@ecommerce-manager/database';
import { PrismaService } from '../common/prisma/prisma.service';
import { paginate } from '../common/dto/pagination.dto';
import { CreateStockEntryDto } from './dto/create-stock-entry.dto';
import { QueryStockEntriesDto } from './dto/query-stock-entries.dto';

@Injectable()
export class StockEntriesService {
  constructor(private readonly prisma: PrismaService) {}

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
      status: entry.status,
      supplier: entry.supplier,
      items: entry.items.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        sku: item.variant.sku,
        productName: item.variant.product.name,
        quantity: item.quantity,
        unitCost: item.unitCost,
      })),
    };
  }

  async create(companyId: string, userId: string, dto: CreateStockEntryDto) {
    const status = dto.status ?? 'DRAFT';

    const entryId = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.stockEntry.create({
        data: {
          companyId,
          supplierId: dto.supplierId ?? null,
          entryDate: new Date(dto.entryDate),
          invoiceNumber: dto.invoiceNumber ?? null,
          notes: dto.notes ?? null,
          status: 'DRAFT',
          items: {
            create: dto.items.map((item) => ({
              variantId: item.variantId,
              quantity: item.quantity,
              unitCost: item.unitCost,
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
    items: Array<{ variantId: string; quantity: number; unitCost: Prisma.Decimal }>,
  ) {
    const entry = await tx.stockEntry.findFirstOrThrow({ where: { id: stockEntryId } });

    for (const item of items) {
      await tx.inventoryMovement.create({
        data: {
          companyId,
          variantId: item.variantId,
          type: 'PURCHASE',
          quantity: item.quantity,
          reference: entry.invoiceNumber ?? stockEntryId,
          note: 'Confirmação de entrada de estoque',
          createdBy: userId,
        },
      });

      await tx.inventory.upsert({
        where: { variantId: item.variantId },
        update: { available: { increment: item.quantity } },
        create: {
          companyId,
          variantId: item.variantId,
          available: item.quantity,
          reserved: 0,
        },
      });

      await tx.productCostHistory.create({
        data: {
          variantId: item.variantId,
          cost: item.unitCost,
          effectiveDate: entry.entryDate,
          note: 'Custo registrado a partir de entrada de estoque',
        },
      });
    }

    await tx.stockEntry.update({ where: { id: stockEntryId }, data: { status: 'CONFIRMED' } });
  }
}
