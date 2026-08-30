import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateRecurringExpenseDto {
  @IsUUID()
  categoryId!: string;

  // Opcional — quando não informada, usa o nome da categoria.
  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  dayOfMonth!: number;

  @IsOptional()
  @IsString()
  paymentMethod?: string;
}
