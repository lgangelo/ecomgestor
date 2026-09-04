/**
 * Categorias de erro (mesmo espírito de `tiktok.errors.ts`) — a política de retry dos jobs
 * decide com base nisso, nunca em retry infinito.
 */
export type ShopeeErrorCategory = 'AUTH' | 'RATE_LIMIT' | 'TEMPORARY' | 'VALIDATION' | 'PERMANENT';

export class ShopeeApiError extends Error {
  constructor(
    message: string,
    public readonly category: ShopeeErrorCategory,
    public readonly statusCode?: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ShopeeApiError';
  }
}

/** Categorias que justificam nova tentativa automática — nunca AUTH/VALIDATION/PERMANENT. */
export function isShopeeRetryableCategory(category: ShopeeErrorCategory): boolean {
  return category === 'RATE_LIMIT' || category === 'TEMPORARY';
}
