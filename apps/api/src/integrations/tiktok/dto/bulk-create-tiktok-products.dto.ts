import { ArrayMinSize, IsArray, IsInt, Matches, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
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

  /** Estoque reportado pela TikTok no momento da criação — semeia o saldo inicial (seção 10). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;

  /** URL da imagem principal do produto na TikTok — só a referência remota, nunca um arquivo. */
  @IsOptional()
  @IsString()
  imageUrl?: string;
}

export class BulkCreateTikTokProductsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkCreateTikTokProductItemDto)
  items!: BulkCreateTikTokProductItemDto[];
}
