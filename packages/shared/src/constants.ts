export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export const MANUAL_SALE_CHANNELS = ['INSTAGRAM', 'WHATSAPP', 'LOJA_FISICA', 'OUTRO'] as const;

export const EXPENSE_CATEGORY_NAMES = [
  'Marketing',
  'Contabilidade',
  'Embalagem',
  'Software',
  'Internet',
  'Frete',
  'Taxa bancária',
  'Impostos',
  'Material',
  'Outros',
] as const;

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutos
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 dias

export const AUTH_COOKIE_NAME = 'ecm_access_token';
export const REFRESH_COOKIE_NAME = 'ecm_refresh_token';
export const CSRF_COOKIE_NAME = 'ecm_csrf_token';
export const CSRF_HEADER_NAME = 'x-csrf-token';

/** Chaves que nunca podem ser registradas em logs, mesmo que apareçam em payloads. */
export const SENSITIVE_LOG_KEYS = [
  'password',
  'passwordHash',
  'password_hash',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'authorization',
  'token',
  'secret',
  'credential',
  'credentials',
];
