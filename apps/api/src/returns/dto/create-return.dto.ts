import { ReturnItemCondition } from '@ecommerce-manager/database';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReturnItemDto {
  @IsUUID()
  orderItemId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsEnum(ReturnItemCondition)
  condition?: ReturnItemCondition;

  // Decisão explícita — nunca inferida automaticamente (seção 18).
  @IsOptional()
  @IsBoolean()
  restockOnReturn?: boolean;
}

export class CreateReturnDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items!: ReturnItemDto[];
}
