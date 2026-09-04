import { IsOptional, IsString } from 'class-validator';

export class GenerateProductCopyDto {
  @IsOptional()
  @IsString()
  titleHint?: string;

  @IsOptional()
  @IsString()
  descriptionHint?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsString()
  brand?: string;
}
