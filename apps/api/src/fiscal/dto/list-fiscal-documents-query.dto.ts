import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { FiscalDocumentStatus, FiscalDocumentType } from '@ecommerce-manager/database';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListFiscalDocumentsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsEnum(FiscalDocumentType)
  type?: FiscalDocumentType;

  @IsOptional()
  @IsEnum(FiscalDocumentStatus)
  status?: FiscalDocumentStatus;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
