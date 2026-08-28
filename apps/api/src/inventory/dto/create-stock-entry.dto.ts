import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class StockEntryItemDto {
  @IsUUID()
  variantId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitCost!: number;
}

const STOCK_ENTRY_STATUSES = ['DRAFT', 'CONFIRMED'] as const;

export class CreateStockEntryDto {
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsISO8601()
  entryDate!: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsIn(STOCK_ENTRY_STATUSES)
  status?: (typeof STOCK_ENTRY_STATUSES)[number];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockEntryItemDto)
  items!: StockEntryItemDto[];
}
