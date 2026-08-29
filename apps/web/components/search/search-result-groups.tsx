import { formatBRL } from '@ecommerce-manager/shared';
import { formatDate } from '@/lib/format';
import type { SearchResult } from '@/hooks/use-search';

export interface FlatSearchItem {
  key: string;
  href: string;
  title: string;
  subtitle: string;
}

/** Achata o resultado da busca em uma lista única, na mesma ordem de exibição (seção 38 da Fase
 * 4: Pedidos, Produtos, Documentos fiscais) — usado pela navegação por teclado do Ctrl+K. */
export function flattenSearchResult(result: SearchResult | undefined): FlatSearchItem[] {
  if (!result) return [];
  return [
    ...result.orders.map((o) => ({
      key: `order-${o.id}`,
      href: `/vendas/pedidos/${o.id}`,
      title: o.externalOrderId ?? o.id.slice(0, 8),
      subtitle: `${o.channelName} • ${formatDate(o.orderDate)} • ${formatBRL(o.total)}`,
    })),
    ...result.products.map((p) => ({
      key: `product-${p.variantId}`,
      href: `/produtos/${p.productId}`,
      title: p.productName,
      subtitle: `SKU ${p.sku}`,
    })),
    ...result.fiscalDocuments.map((d) => ({
      key: `fiscal-${d.id}`,
      href: d.orderId ? `/vendas/pedidos/${d.orderId}` : '/fiscal',
      title: `NF-e ${d.number ?? d.id.slice(0, 8)}`,
      subtitle: d.type === 'RETURN_INVOICE' ? 'Devolução' : 'Venda',
    })),
  ];
}

/** Seção 38 — agrupado por tipo, cada item clicável. `activeKey` (opcional) destaca o item
 * selecionado pela navegação por teclado do Ctrl+K. */
export function SearchResultGroups({
  result,
  activeKey,
  onSelect,
}: {
  result: SearchResult;
  activeKey?: string;
  onSelect: (item: FlatSearchItem) => void;
}) {
  const groups: Array<{ label: string; items: FlatSearchItem[] }> = [
    { label: 'Pedidos', items: flattenSearchResult({ orders: result.orders, products: [], fiscalDocuments: [] }) },
    { label: 'Produtos', items: flattenSearchResult({ orders: [], products: result.products, fiscalDocuments: [] }) },
    {
      label: 'Documentos fiscais',
      items: flattenSearchResult({ orders: [], products: [], fiscalDocuments: result.fiscalDocuments }),
    },
  ];

  return (
    <div className="max-h-96 overflow-y-auto py-1">
      {groups
        .filter((g) => g.items.length > 0)
        .map((group) => (
          <div key={group.label} className="px-1 py-1">
            <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            {group.items.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelect(item)}
                className={`flex w-full flex-col rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent ${
                  activeKey === item.key ? 'bg-accent' : ''
                }`}
              >
                <span className="font-medium text-foreground">{item.title}</span>
                <span className="text-xs text-muted-foreground">{item.subtitle}</span>
              </button>
            ))}
          </div>
        ))}
    </div>
  );
}
