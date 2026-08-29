'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useGlobalSearch, hasSearchResults, SEARCH_MIN_LENGTH } from '@/hooks/use-search';
import { SearchResultGroups, type FlatSearchItem } from './search-result-groups';

/** Busca no header (seção 37 da Fase 4). Ctrl+K abre o command palette (mesma infraestrutura,
 * ver `command-palette.tsx`) — este componente é a busca inline sempre visível. */
export function GlobalSearch() {
  const router = useRouter();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const debouncedQuery = useDebouncedValue(query, 300);
  const { data, isFetching } = useGlobalSearch(debouncedQuery);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(item: FlatSearchItem) {
    setOpen(false);
    setQuery('');
    router.push(item.href);
  }

  const showResults = open && debouncedQuery.trim().length >= SEARCH_MIN_LENGTH;

  return (
    <div ref={containerRef} className="relative hidden w-full max-w-sm lg:block">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder="Buscar pedidos, produtos, SKU, cliente ou NF-e..."
        className="pl-8"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {showResults && (
        <div className="absolute left-0 top-full z-30 mt-1 w-full min-w-80 rounded-md border border-border bg-popover shadow-md">
          {isFetching && !data ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Buscando...</p>
          ) : !hasSearchResults(data) ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Nenhum resultado para &quot;{debouncedQuery}&quot;.</p>
          ) : (
            <SearchResultGroups result={data!} onSelect={handleSelect} />
          )}
        </div>
      )}
    </div>
  );
}
