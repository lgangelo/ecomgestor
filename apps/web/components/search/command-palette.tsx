'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useGlobalSearch, SEARCH_MIN_LENGTH } from '@/hooks/use-search';
import { SearchResultGroups, flattenSearchResult } from './search-result-groups';

interface QuickAction {
  key: string;
  label: string;
  href: string;
  permission?: string;
}

/** Ações rápidas do Ctrl+K (seção 40 da Fase 4) — cada uma só aparece se o usuário tiver a
 * permissão correspondente. */
const QUICK_ACTIONS: QuickAction[] = [
  { key: 'new-sale', label: 'Nova venda', href: '/vendas/nova', permission: 'order.create' },
  { key: 'new-entry', label: 'Nova entrada', href: '/produtos/entradas', permission: 'inventory.adjust' },
  { key: 'new-product', label: 'Novo produto', href: '/produtos', permission: 'product.create' },
  { key: 'adjust-stock', label: 'Ajustar estoque', href: '/produtos/estoque', permission: 'inventory.adjust' },
  { key: 'monthly-closing', label: 'Fechamento mensal', href: '/financeiro/fechamento', permission: 'finance.manage' },
  { key: 'open-tiktok', label: 'Abrir TikTok', href: '/integracoes/tiktok', permission: 'integration.tiktok.read' },
];

/** Command palette (Ctrl+K / Cmd+K, seção 40) — mesma infraestrutura de busca do header
 * (`useGlobalSearch`), mais ações rápidas de navegação. */
export function CommandPalette({
  open,
  onOpenChange,
  permissions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  permissions: string[];
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const debouncedQuery = useDebouncedValue(query, 300);
  const { data } = useGlobalSearch(debouncedQuery);

  const actions = React.useMemo(
    () => QUICK_ACTIONS.filter((a) => !a.permission || permissions.includes(a.permission)),
    [permissions],
  );
  const filteredActions =
    query.trim().length === 0
      ? actions
      : actions.filter((a) => a.label.toLowerCase().includes(query.trim().toLowerCase()));

  const resultItems = React.useMemo(
    () => (debouncedQuery.trim().length >= SEARCH_MIN_LENGTH ? flattenSearchResult(data) : []),
    [debouncedQuery, data],
  );

  const flatList = React.useMemo(
    () => [
      ...filteredActions.map((a) => ({ key: a.key, href: a.href })),
      ...resultItems.map((item) => ({ key: item.key, href: item.href })),
    ],
    [filteredActions, resultItems],
  );

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query, data]);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  function navigate(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(flatList.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const active = flatList[activeIndex];
      if (active) navigate(active.href);
    }
  }

  const activeKey = flatList[activeIndex]?.key;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-32 translate-y-0 gap-0 p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Busca rápida</DialogTitle>
        <div className="border-b border-border p-3">
          <Input
            autoFocus
            placeholder="Buscar ou executar uma ação..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="max-h-96 overflow-y-auto p-1">
          {filteredActions.length > 0 && (
            <div className="px-1 py-1">
              <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Ações rápidas
              </p>
              {filteredActions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => navigate(action.href)}
                  className={`block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent ${
                    activeKey === action.key ? 'bg-accent' : ''
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {data && resultItems.length > 0 && (
            <SearchResultGroups result={data} activeKey={activeKey} onSelect={(item) => navigate(item.href)} />
          )}

          {debouncedQuery.trim().length >= SEARCH_MIN_LENGTH &&
            resultItems.length === 0 &&
            filteredActions.length === 0 && (
              <p className="px-3 py-4 text-sm text-muted-foreground">Nenhum resultado para &quot;{debouncedQuery}&quot;.</p>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
