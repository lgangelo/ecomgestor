import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MinLength, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV!: string;

  @IsInt()
  PORT!: number;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET deve ter ao menos 32 caracteres' })
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET deve ter ao menos 32 caracteres' })
  JWT_REFRESH_SECRET!: string;

  @IsString()
  WEB_APP_URL!: string;

  @IsOptional()
  @IsString()
  COOKIE_DOMAIN?: string;

  // Só para testar em HTTP puro sem TLS (ex.: acesso direto por IP) — nunca usar 'false' com
  // tráfego real. Ausente ou qualquer valor diferente de 'false' mantém o padrão (Secure em
  // produção).
  @IsOptional()
  @IsIn(['true', 'false'])
  COOKIE_SECURE?: string;

  // Obrigatória (mesmo padrão de JWT_ACCESS_SECRET/JWT_REFRESH_SECRET) — cifra os tokens OAuth
  // de todas as integrações em repouso. Era opcional com um fallback hardcoded no código-fonte
  // (achado real de uma auditoria de segurança: qualquer instalação que esquecesse de configurar
  // isso cifraria os segredos de integração com uma chave pública, visível a qualquer um com
  // acesso ao repositório) — a aplicação agora recusa subir sem uma chave real, do mesmo jeito
  // que já recusava sem os segredos de JWT.
  @IsString()
  @MinLength(32, { message: 'INTEGRATION_SECRETS_KEY deve ter ao menos 32 caracteres' })
  INTEGRATION_SECRETS_KEY!: string;

  // TikTok Shop é opcional (seção 56 da Fase 3): a aplicação deve inicializar normalmente
  // sem essas variáveis, apenas exibindo a integração como "não configurada".
  @IsOptional()
  @IsString()
  TIKTOK_APP_KEY?: string;

  @IsOptional()
  @IsString()
  TIKTOK_APP_SECRET?: string;

  @IsOptional()
  @IsString()
  TIKTOK_SERVICE_ID?: string;

  @IsOptional()
  @IsString()
  TIKTOK_REDIRECT_URI?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  TIKTOK_INVENTORY_PUSH_ENABLED?: string;

  @IsOptional()
  @IsString()
  TIKTOK_RECONCILE_INTERVAL_MINUTES?: string;

  @IsOptional()
  @IsIn(['REFERENCE_ONLY', 'PERSIST'])
  XML_STORAGE_MODE?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints ?? {}).join('; '))
      .join(' | ');
    throw new Error(`Variáveis de ambiente inválidas: ${messages}`);
  }
  return validated;
}
