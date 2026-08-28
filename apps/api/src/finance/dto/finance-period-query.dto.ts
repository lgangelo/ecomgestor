import { IsDateString, IsOptional } from 'class-validator';

export class FinancePeriodQueryDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
