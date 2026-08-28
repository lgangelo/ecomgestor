import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';

export class DashboardQueryDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsUUID()
  channelId?: string;

  @IsOptional()
  @IsIn(['previous_period'])
  compare?: 'previous_period';
}
