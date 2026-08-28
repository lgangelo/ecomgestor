import { FiscalDocumentType } from '@ecommerce-manager/database';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class UploadFiscalDocumentDto {
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  returnId?: string;

  @IsEnum(FiscalDocumentType)
  type!: FiscalDocumentType;
}
