import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { InventoryLedgerService } from './ledger.service';
import { CreateCountDto } from './dto/create-count.dto';
import { UpdateCountItemDto } from './dto/update-count-item.dto';

@Injectable()
export class InventoryCountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: InventoryLedgerService,
  ) {}

  async findAll(companyId: string) {
    return this.prisma.client.inventoryCount.findMany({
      where: { companyId },
      include: { _count: { select: { items: true } } },
      orderBy: { startedAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const count = await this.prisma.client.inventoryCount.findFirst({
      where: { id, companyId },
      include: {
        items: {
          include: { variant: { select: { sku: true, product: { select: { name: true } } } } },
        },
      },
    });
    if (!count) throw new NotFoundException('Inventário não encontrado');
    return count;
  }

  /** Inicia a contagem com o saldo do sistema (onHand) congelado no momento do início. */
  async start(companyId: string, userId: string, dto: CreateCountDto) {
    const inventories = await this.prisma.client.inventory.findMany({
      where: { companyId },
      select: { variantId: true, onHand: true },
    });

    const count = await this.prisma.client.inventoryCount.create({
      data: {
        companyId,
        createdBy: userId,
        notes: dto.notes ?? null,
        items: {
          create: inventories.map((inv) => ({
            variantId: inv.variantId,
            systemQuantity: inv.onHand,
          })),
        },
      },
    });

    return this.findOne(count.id, companyId);
  }

  async updateItem(countId: string, itemId: string, companyId: string, dto: UpdateCountItemDto) {
    const count = await this.prisma.client.inventoryCount.findFirst({ where: { id: countId, companyId } });
    if (!count) throw new NotFoundException('Inventário não encontrado');
    if (count.status !== 'OPEN') {
      throw new BadRequestException('Este inventário já foi finalizado ou cancelado');
    }

    const item = await this.prisma.client.inventoryCountItem.findFirst({
      where: { id: itemId, inventoryCountId: countId },
    });
    if (!item) throw new NotFoundException('Item de inventário não encontrado');

    return this.prisma.client.inventoryCountItem.update({
      where: { id: itemId },
      data: {
        countedQuantity: dto.countedQuantity,
        difference: dto.countedQuantity - item.systemQuantity,
      },
    });
  }

  /** Gera os ajustes de divergência, congela o inventário e audita. */
  async complete(id: string, companyId: string, userId: string) {
    const count = await this.prisma.client.inventoryCount.findFirst({
      where: { id, companyId },
      include: { items: true },
    });
    if (!count) throw new NotFoundException('Inventário não encontrado');
    if (count.status !== 'OPEN') {
      throw new BadRequestException('Este inventário já foi finalizado ou cancelado');
    }

    const pending = count.items.filter((item) => item.countedQuantity === null);
    if (pending.length > 0) {
      throw new BadRequestException(
        `Existem ${pending.length} item(ns) sem contagem física registrada.`,
      );
    }

    const divergences = count.items.filter((item) => (item.difference ?? 0) !== 0);

    await this.prisma.client.$transaction(async (tx) => {
      for (const item of divergences) {
        await this.ledger.adjust(
          tx,
          {
            companyId,
            variantId: item.variantId,
            referenceType: 'inventory_count',
            referenceId: count.id,
            userId,
            reason: 'Ajuste gerado por inventário físico',
          },
          item.difference!,
        );
      }

      await tx.inventoryCount.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    });

    return this.findOne(id, companyId);
  }
}
