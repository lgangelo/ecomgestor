'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

export interface SearchOrderResult {
  id: string;
  externalOrderId: string | null;
  customerName: string | null;
  channelName: string;
  total: string;
  orderDate: string;
}

export interface SearchProductResult {
  productId: string;
  productName: string;
  variantId: string;
  sku: string;
}

export interface SearchFiscalDocumentResult {
  id: string;
  number: string | null;
  type: string;
  orderId: string | null;
  returnId: string | null;
}

export interface SearchResult {
  orders: SearchOrderResult[];
  products: SearchProductResult[];
  fiscalDocuments: SearchFiscalDocumentResult[];
}

/** Mínimo de 2 caracteres (seção 39 da Fase 4) — evita varrer a base a cada tecla isolada. */
export const SEARCH_MIN_LENGTH = 2;

/** Busca global (seção 37-39). O componente que chama este hook é responsável por debounce do
 * texto digitado (`useDebouncedValue`) antes de passar `query` — este hook só evita disparar
 * abaixo do mínimo de caracteres. */
export function useGlobalSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['global-search', trimmed],
    queryFn: () => apiFetch<SearchResult>(`/search${buildQueryString({ q: trimmed })}`),
    enabled: trimmed.length >= SEARCH_MIN_LENGTH,
  });
}

export function hasSearchResults(result: SearchResult | undefined): boolean {
  if (!result) return false;
  return result.orders.length > 0 || result.products.length > 0 || result.fiscalDocuments.length > 0;
}
