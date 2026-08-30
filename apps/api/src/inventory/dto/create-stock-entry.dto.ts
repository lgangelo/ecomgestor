import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
const ALLOCATION_METHODS = ['BY_VALUE', 'BY_QUANTITY'] as const;

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
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  shippingCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  otherCosts?: number;

  @IsOptional()
  @IsIn(ALLOCATION_METHODS)
  allocationMethod?: (typeof ALLOCATION_METHODS)[number];

  @IsOptional()
  @IsIn(STOCK_ENTRY_STATUSES)
  status?: (typeof STOCK_ENTRY_STATUSES)[number];

  /** Registra o custo (histórico de custo) sem mexer no saldo físico — para popular o custo de
   * aquisição de produtos cujo estoque já existe de outra origem (ex.: carga TikTok Shop). */
  @IsOptional()
  @IsBoolean()
  skipStockMovement?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockEntryItemDto)
  items!: StockEntryItemDto[];
}
