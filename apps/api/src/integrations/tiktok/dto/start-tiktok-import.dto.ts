import { IsBoolean, IsISO8601, IsOptional } from 'class-validator';

export class StartTikTokImportDto {
  @IsOptional()
  @IsBoolean()
  importProducts?: boolean;

  @IsOptional()
  @IsBoolean()
  importOrders?: boolean;

  @IsOptional()
  @IsISO8601()
  ordersSince?: string;
}
