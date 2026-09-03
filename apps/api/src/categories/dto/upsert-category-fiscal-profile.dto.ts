import { ChannelType } from '@ecommerce-manager/database';
import { IsEnum, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class UpsertCategoryFiscalProfileDto {
  @IsEnum(ChannelType)
  channelType!: ChannelType;

  // 8 dígitos — formato padrão da Nomenclatura Comum do Mercosul. Sem isso, um erro de digitação
  // (ex.: letra em vez de número) só seria descoberto quando um emissor de NF-e externo rejeitar
  // o valor — bem longe de onde o engano foi cometido.
  @IsString()
  @Matches(/^\d{8}$/, { message: 'NCM deve ter exatamente 8 dígitos numéricos' })
  ncm!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{7}$/, { message: 'CEST deve ter exatamente 7 dígitos numéricos' })
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
  @Matches(/^\d{4}$/, { message: 'CFOP deve ter exatamente 4 dígitos numéricos' })
  cfopIntraestadual!: string;

  @IsString()
  @Matches(/^\d{4}$/, { message: 'CFOP deve ter exatamente 4 dígitos numéricos' })
  cfopInterestadual!: string;

  // CST do PIS/COFINS — 2 dígitos (ex.: "49", "01"..."99").
  @IsString()
  @Matches(/^\d{2}$/, { message: 'Código de Situação Tributária do PIS/COFINS deve ter exatamente 2 dígitos numéricos' })
  pisCofinsCode!: string;

  // Origem da mercadoria (ICMS) — 1 dígito, 0 a 8 (tabela oficial do Convênio ICMS 38/13).
  @IsString()
  @Matches(/^[0-8]$/, { message: 'Origem deve ser um único dígito de 0 a 8' })
  origem!: string;

  // CSOSN (Simples Nacional) — 3 dígitos (ex.: 101, 102, 201..203, 300, 400, 500, 900).
  @IsString()
  @Matches(/^\d{3}$/, { message: 'CSOSN deve ter exatamente 3 dígitos numéricos' })
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
