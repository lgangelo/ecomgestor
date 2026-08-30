import { ProductStatus } from '@ecommerce-manager/database';
import { ArrayMinSize, IsArray, IsEnum, IsUUID } from 'class-validator';

export class BulkUpdateProductStatusDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids!: string[];

  @IsEnum(ProductStatus)
  status!: ProductStatus;
}
