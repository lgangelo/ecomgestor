import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTikTokProductDto {
  @IsString()
  externalSku!: string;

  @IsOptional()
  @IsString()
  externalProductId?: string;

  @IsString()
  name!: string;

  @IsString()
  sku!: string;

  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'price deve ser um valor decimal válido' })
  price!: string;

  /** Estoque reportado pela TikTok no momento da criação — semeia o saldo inicial (seção 10). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;
}
