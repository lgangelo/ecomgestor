import { ExpenseStatus } from '@ecommerce-manager/database';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateExpenseDto {
  @IsUUID()
  categoryId!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsDateString()
  date!: string;

  // Mês/ano de competência gerencial — pode diferir da data de pagamento (ex: conta em atraso).
  // Se omitido, assume a própria data de pagamento como competência.
  @IsOptional()
  @IsDateString()
  competenceDate?: string;

  @IsOptional()
  @IsEnum(ExpenseStatus)
  status?: ExpenseStatus;

  @IsOptional()
  @IsString()
  paymentMethod?: string;
}
