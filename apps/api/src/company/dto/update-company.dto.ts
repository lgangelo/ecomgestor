import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  cnpj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  // `allowNegativeStock` (seção 65) fica de fora de propósito: o campo já existe no schema mas
  // ainda não é lido pelo InventoryLedgerService (limitação documentada no schema) — expor um
  // toggle sem efeito nenhum seria mais enganoso do que não expor. Reavaliar quando a tela de
  // Configurações (item H da Fase 4) for construída.

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  slowMovingDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  restockCoverageDays?: number;

  @IsOptional()
  @IsBoolean()
  inventoryAutoSyncEnabled?: boolean;
}
