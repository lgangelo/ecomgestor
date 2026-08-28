import { RefundType } from '@ecommerce-manager/database';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateRefundDto {
  @IsEnum(RefundType)
  type!: RefundType;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsString()
  externalReference?: string;
}
