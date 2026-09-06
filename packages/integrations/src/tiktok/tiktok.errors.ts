/**
 * Categorias de erro usadas pela política de retry (seção 25 da Fase 3). Nenhum job de
 * integração faz retry infinito — a categoria decide se vale tentar de novo e com que backoff.
 */
export type TikTokErrorCategory = 'AUTH' | 'RATE_LIMIT' | 'TEMPORARY' | 'VALIDATION' | 'PERMANENT';

export class TikTokApiError extends Error {
  constructor(
    message: string,
    public readonly category: TikTokErrorCategory,
    public readonly statusCode?: number,
    public readonly retryAfterSeconds?: number,
    // Código numérico bruto do envelope de erro da TikTok Shop (ex.: 106013) — a MESMA mensagem
    // de texto às vezes é reaproveitada de forma confusa/genérica pra causas diferentes (achado
    // real: "shop_cipher" apareceu em dois erros opostos, "not required" e "required", pro MESMO
    // endpoint); o código é a única forma confiável de diferenciar qual validação disparou de
    // verdade, sem precisar adivinhar pelo texto.
    public readonly code?: number,
  ) {
    super(message);
    this.name = 'TikTokApiError';
  }
}

export class TikTokSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TikTokSignatureError';
  }
}

/** Categorias que justificam nova tentativa automática — nunca AUTH/VALIDATION/PERMANENT. */
export function isRetryableCategory(category: TikTokErrorCategory): boolean {
  return category === 'RATE_LIMIT' || category === 'TEMPORARY';
}
