import { OrderIntegrationSyncStatus, OrderStatus } from '@ecommerce-manager/database';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class QueryOrdersDto extends PaginationQueryDto {
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
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsEnum(OrderIntegrationSyncStatus)
  syncStatus?: OrderIntegrationSyncStatus;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  hasFiscalDocument?: boolean;
}
