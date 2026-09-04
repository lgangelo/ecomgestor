/**
 * Categorias de erro (mesmo espírito de `shopee.errors.ts`/`tiktok.errors.ts`) — a política de
 * retry dos jobs decide com base nisso, nunca em retry infinito.
 */
export type MercadoLivreErrorCategory = 'AUTH' | 'RATE_LIMIT' | 'TEMPORARY' | 'VALIDATION' | 'PERMANENT';

export class MercadoLivreApiError extends Error {
  constructor(
    message: string,
    public readonly category: MercadoLivreErrorCategory,
    public readonly statusCode?: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'MercadoLivreApiError';
  }
}

/** Categorias que justificam nova tentativa automática — nunca AUTH/VALIDATION/PERMANENT. */
export function isMercadoLivreRetryableCategory(category: MercadoLivreErrorCategory): boolean {
  return category === 'RATE_LIMIT' || category === 'TEMPORARY';
}
