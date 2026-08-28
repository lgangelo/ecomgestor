import { IsOptional, IsString, Matches } from 'class-validator';

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
}
