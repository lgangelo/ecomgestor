import { VariantStatus } from '@ecommerce-manager/database';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateVariantDto {
  @IsString()
  @MinLength(1)
  sku!: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  length?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  width?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  height?: number;

  // Opcional: um produto pode ser cadastrado sem preço definido ainda (pedido do usuário) — o
  // preço só passa a ser exigido na hora de ativar a variação/produto (ver
  // `ProductsService.assertCanActivate`).
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  suggestedPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @IsEnum(VariantStatus)
  status?: VariantStatus;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}
