import { Type } from 'class-transformer';
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateTaxConfigurationDto {
  @IsString()
  @IsNotEmpty()
  taxRegime!: string;

  // Fração decimal (0.06 = 6%), nunca hardcoded no DRE — sempre lido desta configuração.
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  estimatedRate!: number;

  @IsDateString()
  validFrom!: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;
}
