import { ChannelType } from '@ecommerce-manager/database';
import { IsEnum, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class UpsertCategoryFiscalProfileDto {
  @IsEnum(ChannelType)
  channelType!: ChannelType;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  ncm!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cest?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  exTipi?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  naturezaOperacao!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  cfopIntraestadual!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  cfopInterestadual!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  pisCofinsCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  origem!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  csosn!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unidadeMedida!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  recopi?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  fichaConteudoImportacao?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  aliquotaAproximada?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  dadosAdicionais?: string;
}
