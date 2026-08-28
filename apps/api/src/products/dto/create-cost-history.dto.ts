import { Type } from 'class-transformer';
import { IsISO8601, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateCostHistoryDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cost!: number;

  @IsISO8601()
  effectiveDate!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
