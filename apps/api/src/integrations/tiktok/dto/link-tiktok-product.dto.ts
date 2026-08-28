import { IsOptional, IsString, IsUUID } from 'class-validator';

export class LinkTikTokProductDto {
  @IsString()
  externalSku!: string;

  @IsOptional()
  @IsString()
  externalProductId?: string;

  @IsUUID()
  variantId!: string;
}
