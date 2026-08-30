import { ArrayMinSize, IsArray, Matches, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class BulkCreateTikTokProductItemDto {
  @IsString()
  externalSku!: string;

  @IsOptional()
  @IsString()
  externalProductId?: string;

  @IsString()
  name!: string;

  /** Opcional — sem SKU do vendedor informado, o backend gera um placeholder sequencial
   * ("0001", "0002", ...) para o operador corrigir depois. */
  @IsOptional()
  @IsString()
  sku?: string;

  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'price deve ser um valor decimal válido' })
  price!: string;
}

export class BulkCreateTikTokProductsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkCreateTikTokProductItemDto)
  items!: BulkCreateTikTokProductItemDto[];
}
