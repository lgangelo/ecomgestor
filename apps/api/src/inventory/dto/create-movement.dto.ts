import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';

export const MANUAL_MOVEMENT_TYPES = [
  'ADJUSTMENT',
  'DAMAGE',
  'LOSS',
  'RESERVATION',
  'RELEASE',
] as const;
export type ManualMovementType = (typeof MANUAL_MOVEMENT_TYPES)[number];

export class CreateMovementDto {
  @IsUUID()
  variantId!: string;

  @IsIn(MANUAL_MOVEMENT_TYPES)
  type!: ManualMovementType;

  /**
   * Para `ADJUSTMENT` pode ser negativo (delta assinado a somar ao disponível).
   * Para os demais tipos deve ser um inteiro positivo (o sentido é definido pelo `type`).
   */
  @Type(() => Number)
  @IsInt()
  quantity!: number;

  @IsOptional()
  @IsString()
  note?: string;
}
