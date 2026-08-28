import { IsOptional, IsString } from 'class-validator';

export class QueryCategoryDto {
  @IsOptional()
  @IsString()
  search?: string;
}
