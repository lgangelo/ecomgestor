import { OrderStatus } from '@ecommerce-manager/database';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const MANUAL_CHANNEL_TYPES = ['INSTAGRAM', 'WHATSAPP', 'LOJA_FISICA', 'OUTRO'] as const;
export type ManualChannelType = (typeof MANUAL_CHANNEL_TYPES)[number];

export class ManualOrderItemDto {
  @IsUUID()
  variantId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;
}

export class CreateManualOrderDto {
  @IsIn(MANUAL_CHANNEL_TYPES)
  channelType!: ManualChannelType;

  @IsString()
  @MinLength(1)
  customerName!: string;

  @IsISO8601()
  orderDate!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ManualOrderItemDto)
  items!: ManualOrderItemDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  shipping?: number;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
