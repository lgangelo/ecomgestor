import { ReturnStatus } from '@ecommerce-manager/database';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class QueryReturnsDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ReturnStatus)
  status?: ReturnStatus;
}
