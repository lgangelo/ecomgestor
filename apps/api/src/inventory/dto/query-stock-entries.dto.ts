import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const STOCK_ENTRY_STATUSES = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;

export class QueryStockEntriesDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(STOCK_ENTRY_STATUSES)
  status?: (typeof STOCK_ENTRY_STATUSES)[number];
}
