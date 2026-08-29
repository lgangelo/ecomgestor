'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type FilterValue = string | number | boolean | undefined;

/**
 * Filtros persistentes na URL (seção 57 da Fase 4) — o estado de filtro/paginação vive na query
 * string em vez de `useState` local, então atualizar o navegador (F5) ou compartilhar o link
 * preserva os filtros aplicados. `defaults` define o shape e o tipo de cada campo (string/number/
 * boolean) e nunca é escrito na URL — só o que diverge do default aparece na query string
 * (seção 58: nunca serializa um objeto inteiro, cada filtro é sua própria chave simples).
 *
 * `defaults` deve ser uma referência estável entre renders (declarada fora do componente, ou
 * memoizada) — senão o estado é recalculado a cada render sem problema de correção, só de
 * performance.
 */
export function useUrlFilters<T extends Record<string, FilterValue>>(defaults: T) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const state = React.useMemo(() => {
    const result = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const raw = searchParams.get(key);
      if (raw === null) continue;
      const defaultValue = defaults[key as keyof T];
      if (typeof defaultValue === 'number') {
        const parsed = Number(raw);
        if (!Number.isNaN(parsed)) (result as Record<string, FilterValue>)[key] = parsed;
      } else if (typeof defaultValue === 'boolean') {
        (result as Record<string, FilterValue>)[key] = raw === 'true';
      } else {
        (result as Record<string, FilterValue>)[key] = raw;
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setFilters = React.useCallback(
    (patch: Partial<T>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const key of Object.keys(patch)) {
        const value = patch[key];
        if (value === undefined || value === '' || value === defaults[key as keyof T]) {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, pathname, searchParams],
  );

  return [state, setFilters] as const;
}
