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
    const openCount = await this.prisma.client.inventoryCount.findFirst({
      where: { companyId, status: 'OPEN' },
      select: { id: true },
    });
    if (openCount) {
      throw new BadRequestException('Já existe uma contagem de inventário em aberto — finalize-a antes de iniciar outra.');
    }

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

    await this.prisma.client.$transaction(async (tx) => {
      // `item.difference` foi calculado contra o saldo CONGELADO no início da contagem
      // (`systemQuantity`) — nada impede o estoque de se mover normalmente (venda, compra)
      // enquanto a contagem está aberta, então esse valor pode estar desatualizado na hora de
      // fechar. Usá-lo direto aqui gerava um ajuste fantasma: se 10 unidades foram vendidas
      // legitimamente durante a contagem (onHand caiu de 100 pra 90) e o contador achou 90 de
      // verdade na prateleira (contagem correta!), `difference = 90 - 100 = -10` ainda assim
      // debitava mais 10 do saldo JÁ correto de 90, levando a 80 — um furo de estoque criado
      // pela própria ferramenta que deveria corrigir furos. Por isso o delta real de cada item é
      // recalculado aqui contra o saldo ATUAL (lido dentro desta mesma transação, na hora do
      // fechamento), nunca contra o saldo congelado do início.
      const currentInventories = await tx.inventory.findMany({
        where: { companyId, variantId: { in: count.items.map((item) => item.variantId) } },
        select: { variantId: true, onHand: true },
      });
      const currentOnHandByVariant = new Map(currentInventories.map((inv) => [inv.variantId, inv.onHand]));

      for (const item of count.items) {
        const currentOnHand = currentOnHandByVariant.get(item.variantId) ?? 0;
        const realDelta = item.countedQuantity! - currentOnHand;
        if (realDelta === 0) continue;

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
          realDelta,
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
