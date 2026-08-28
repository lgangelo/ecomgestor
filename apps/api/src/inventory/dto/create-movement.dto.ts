import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export const MANUAL_MOVEMENT_TYPES = ['ADJUSTMENT', 'DAMAGE', 'LOSS', 'RESERVATION', 'RELEASE'] as const;
export type ManualMovementType = (typeof MANUAL_MOVEMENT_TYPES)[number];

export class CreateMovementDto {
  @IsUUID()
  variantId!: string;

  @IsIn(MANUAL_MOVEMENT_TYPES)
  type!: ManualMovementType;

  /**
   * Para `ADJUSTMENT` pode ser negativo (delta assinado a somar ao saldo físico).
   * Para os demais tipos deve ser um inteiro positivo (o sentido é definido pelo `type`).
   */
  @Type(() => Number)
  @IsInt()
  quantity!: number;

  // Motivo é obrigatório para qualquer movimentação manual (seção 11) — nunca uma alteração
  // silenciosa de saldo. `note` é observação livre adicional, opcional.
  @IsString()
  @MinLength(3, { message: 'Informe um motivo para esta movimentação' })
  reason!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
