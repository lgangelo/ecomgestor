import { IsOptional, IsString } from 'class-validator';

export class IgnoreTikTokProductDto {
  @IsString()
  externalSku!: string;

  @IsOptional()
  @IsString()
  externalProductId?: string;
}
