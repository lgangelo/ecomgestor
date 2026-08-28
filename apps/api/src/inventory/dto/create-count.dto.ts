import { IsOptional, IsString } from 'class-validator';

export class CreateCountDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
