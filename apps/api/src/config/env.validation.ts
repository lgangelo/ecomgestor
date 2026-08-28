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
