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
    /** Corpo bruto da resposta de erro — a API costuma devolver um array `cause` com o detalhe
     * exato de qual atributo/campo falhou validação; guardado pra diagnóstico (scripts de
     * checagem imprimem isso), nunca logado automaticamente em produção. */
    public readonly rawResponse?: unknown,
  ) {
    super(message);
    this.name = 'MercadoLivreApiError';
  }
}

/** Categorias que justificam nova tentativa automática — nunca AUTH/VALIDATION/PERMANENT. */
export function isMercadoLivreRetryableCategory(category: MercadoLivreErrorCategory): boolean {
  return category === 'RATE_LIMIT' || category === 'TEMPORARY';
}
