import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InventoryMovementType, Prisma } from '@ecommerce-manager/database';

export interface MovementContext {
  companyId: string;
  variantId: string;
  referenceType: string;
  referenceId: string;
  userId?: string | null;
  reason?: string | null;
  note?: string | null;
}

export interface LedgerResult {
  movement: {
    id: string;
    type: InventoryMovementType;
    quantity: number;
    previousOnHand: number;
    newOnHand: number;
    previousReserved: number;
    newReserved: number;
  };
  onHand: number;
  reserved: number;
  available: number;
}

const MAX_ATTEMPTS = 5;

/**
 * Única porta de entrada para qualquer alteração de saldo de estoque (seção 10 — nunca
 * alteração silenciosa). Cada operação é uma escrita atômica "compare-and-swap": lê o saldo
 * atual, calcula o novo valor, e só grava se ninguém alterou o registro entre a leitura e a
 * escrita (via `updateMany` com WHERE nos valores lidos). Se outra transação concorrente
 * venceu a corrida, tenta novamente (até MAX_ATTEMPTS) em vez de sobrescrever — é isso que
 * impede duas vendas simultâneas de consumirem a mesma última unidade (seção 56).
 *
 * `available` nunca é uma coluna — é sempre `onHand - reserved`, computado aqui.
 */
@Injectable()
export class InventoryLedgerService {
  async purchase(tx: Prisma.TransactionClient, ctx: MovementContext, quantity: number): Promise<LedgerResult> {
    this.assertPositive(quantity);
    return this.applyDelta(tx, ctx, InventoryMovementType.PURCHASE, quantity, quantity, 0);
  }

  async restock(tx: Prisma.TransactionClient, ctx: MovementContext, quantity: number): Promise<LedgerResult> {
    this.assertPositive(quantity);
    return this.applyDelta(tx, ctx, InventoryMovementType.RETURN, quantity, quantity, 0);
  }

  async reserve(tx: Prisma.TransactionClient, ctx: MovementContext, quantity: number): Promise<LedgerResult> {
    this.assertPositive(quantity);
    return this.applyDelta(tx, ctx, InventoryMovementType.RESERVATION, quantity, 0, quantity);
  }

  async release(tx: Prisma.TransactionClient, ctx: MovementContext, quantity: number): Promise<LedgerResult> {
    this.assertPositive(quantity);
    return this.applyDelta(tx, ctx, InventoryMovementType.RELEASE, quantity, 0, -quantity);
  }

  /**
   * Baixa efetiva na venda. `fromReservation` também libera a reserva equivalente no mesmo
   * movimento — mas nunca mais do que a variação REALMENTE tem reservado agora. Um pedido
   * importado historicamente com `skipStockMovement` (seção 18) nunca passou pela etapa de
   * reserva de propósito; quando ele progride depois para um status pós-envio via sincronização
   * normal, esta baixa continua chamada com `fromReservation: true` (não há como o chamador
   * saber, ali, que a reserva nunca existiu) — sem o `Math.min`, isso derrubava `reserved` abaixo
   * de zero e travava a baixa física pra sempre com "Quantidade reservada insuficiente", mesmo o
   * pedido tendo saído de verdade (confirmado em produção).
   */
  async commitSale(
    tx: Prisma.TransactionClient,
    ctx: MovementContext,
    quantity: number,
    fromReservation: boolean,
  ): Promise<LedgerResult> {
    this.assertPositive(quantity);
    return this.applyDelta(
      tx,
      ctx,
      InventoryMovementType.SALE,
      -quantity,
      -quantity,
      fromReservation ? (currentReserved: number) => -Math.min(quantity, currentReserved) : 0,
    );
  }

  async writeOff(
    tx: Prisma.TransactionClient,
    ctx: MovementContext,
    quantity: number,
    type: 'DAMAGE' | 'LOSS',
  ): Promise<LedgerResult> {
    this.assertPositive(quantity);
    return this.applyDelta(tx, ctx, type as InventoryMovementType, -quantity, -quantity, 0);
  }

  async cancelPurchase(tx: Prisma.TransactionClient, ctx: MovementContext, quantity: number): Promise<LedgerResult> {
    this.assertPositive(quantity);
    return this.applyDelta(tx, ctx, InventoryMovementType.CANCELLATION, -quantity, -quantity, 0);
  }

  /** Ajuste manual — `delta` é assinado (pode ser negativo). */
  async adjust(tx: Prisma.TransactionClient, ctx: MovementContext, delta: number): Promise<LedgerResult> {
    if (delta === 0) {
      throw new BadRequestException('O ajuste não pode ser zero');
    }
    return this.applyDelta(tx, ctx, InventoryMovementType.ADJUSTMENT, delta, delta, 0);
  }

  private assertPositive(quantity: number) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException('A quantidade deve ser um número inteiro positivo');
    }
  }

  private async applyDelta(
    tx: Prisma.TransactionClient,
    ctx: MovementContext,
    type: InventoryMovementType,
    quantity: number,
    onHandDelta: number,
    reservedDelta: number | ((currentReserved: number) => number),
  ): Promise<LedgerResult> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const current = await this.getOrCreateInventory(tx, ctx.companyId, ctx.variantId);

      const resolvedReservedDelta = typeof reservedDelta === 'function' ? reservedDelta(current.reserved) : reservedDelta;
      const newOnHand = current.onHand + onHandDelta;
      const newReserved = current.reserved + resolvedReservedDelta;
      const newAvailable = newOnHand - newReserved;

      if (newOnHand < 0) {
        throw new BadRequestException(
          `Saldo insuficiente: esta operação deixaria o estoque físico negativo (${newOnHand}).`,
        );
      }
      if (newReserved < 0) {
        throw new BadRequestException(
          `Quantidade reservada insuficiente para esta operação (resultaria em ${newReserved}).`,
        );
      }
      if (newAvailable < 0) {
        throw new BadRequestException(
          `Estoque disponível insuficiente: disponível atual é ${current.onHand - current.reserved}, solicitado impacto deixaria ${newAvailable}.`,
        );
      }

      const cas = await tx.inventory.updateMany({
        where: { variantId: ctx.variantId, onHand: current.onHand, reserved: current.reserved },
        data: { onHand: newOnHand, reserved: newReserved },
      });

      if (cas.count === 1) {
        const movement = await tx.inventoryMovement.create({
          data: {
            companyId: ctx.companyId,
            variantId: ctx.variantId,
            type,
            quantity,
            previousOnHand: current.onHand,
            newOnHand,
            previousReserved: current.reserved,
            newReserved,
            referenceType: ctx.referenceType,
            referenceId: ctx.referenceId,
            reason: ctx.reason ?? null,
            note: ctx.note ?? null,
            createdBy: ctx.userId ?? null,
          },
        });

        return {
          movement,
          onHand: newOnHand,
          reserved: newReserved,
          available: newAvailable,
        };
      }
      // Outra transação alterou o saldo entre a leitura e a escrita — tenta novamente
      // com o valor atualizado (READ COMMITTED garante que a próxima leitura verá o commit).
    }

    throw new ConflictException(
      'Não foi possível atualizar o estoque por concorrência — tente novamente.',
    );
  }

  private async getOrCreateInventory(tx: Prisma.TransactionClient, companyId: string, variantId: string) {
    const existing = await tx.inventory.findUnique({ where: { variantId } });
    if (existing) return existing;

    try {
      return await tx.inventory.create({
        data: { companyId, variantId, onHand: 0, reserved: 0 },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Corrida na criação da linha — outra transação já criou, apenas relemos.
        return tx.inventory.findUniqueOrThrow({ where: { variantId } });
      }
      throw error;
    }
  }
}
