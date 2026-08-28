import { ReturnStatus } from '@ecommerce-manager/database';
import { IsEnum, IsISO8601, IsOptional } from 'class-validator';

export class UpdateReturnStatusDto {
  @IsEnum(ReturnStatus)
  status!: ReturnStatus;

  @IsOptional()
  @IsISO8601()
  resolvedAt?: string;
}
