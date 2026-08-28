import { IsOptional, IsUUID, Matches } from 'class-validator';

export class MonthlyFiscalQueryDto {
  @Matches(/^\d{4}-\d{2}$/, { message: 'referenceMonth deve estar no formato YYYY-MM' })
  referenceMonth!: string;

  @IsOptional()
  @IsUUID()
  channelId?: string;
}
