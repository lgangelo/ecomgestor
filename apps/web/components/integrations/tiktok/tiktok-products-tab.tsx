'use client';

import * as React from 'react';
import { Package } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTikTokUnmatchedProducts, useIgnoreTikTokProduct, useBulkCreateTikTokProducts } from '@/hooks/use-tiktok';
import type { UnmatchedTikTokProduct } from '@/hooks/use-tiktok';
import { TikTokLinkProductDialog } from './tiktok-link-product-dialog';
import { TikTokCreateProductDialog } from './tiktok-create-product-dialog';

export function TikTokProductsTab() {
  const { data, isLoading } = useTikTokUnmatchedProducts(true);
  const ignore = useIgnoreTikTokProduct();
  const bulkCreate = useBulkCreateTikTokProducts();
  const [linking, setLinking] = React.useState<UnmatchedTikTokProduct | null>(null);
  const [creating, setCreating] = React.useState<UnmatchedTikTokProduct | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    // Itens criados (ou ignorados) somem da lista após invalidar a query — descarta seleção
    // de SKUs que não estão mais presentes, para o contador não ficar errado.
    if (!data) return;
    setSelected((prev) => {
      const validSkus = new Set(data.map((p) => p.externalSku));
      const next = new Set([...prev].filter((sku) => validSkus.has(sku)));
      return next.size === prev.size ? prev : next;
    });
  }, [data]);

  function toggleOne(externalSku: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(externalSku)) next.delete(externalSku);
      else next.add(externalSku);
      return next;
    });
  }

  function toggleAll() {
    if (!data) return;
    setSelected((prev) => (prev.size === data.length ? new Set() : new Set(data.map((p) => p.externalSku))));
  }

  function handleBulkCreate() {
    if (!data) return;
    const items = data
      .filter((p) => selected.has(p.externalSku))
      .map((p) => ({
        externalSku: p.externalSku,
        externalProductId: p.externalProductId,
        name: p.name,
        sku: p.sellerSku ?? p.externalSku,
        price: p.price,
      }));
    bulkCreate.mutate(items, { onSuccess: () => setSelected(new Set()) });
  }

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        Produtos TikTok não vinculados. Um vínculo só é confirmado por uma ação explícita — a sugestão automática
        nunca é efetivada sozinha quando há mais de um candidato.
      </p>

      {isLoading || !data ? (
        <div className="rounded-lg border border-border">
          <TableSkeleton />
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={Package} title="Nenhum produto pendente de vínculo" />
      ) : (
        <>
          {selected.size > 0 && (
            <div className="mb-3 flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <span>{selected.size} selecionado(s)</span>
              <Button size="sm" disabled={bulkCreate.isPending} onClick={handleBulkCreate}>
                {bulkCreate.isPending ? 'Criando...' : `Criar ${selected.size} selecionado(s)`}
              </Button>
            </div>
          )}

          {bulkCreate.data && bulkCreate.data.failed.length > 0 && (
            <div className="mb-3 space-y-1 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
              <p className="font-medium text-destructive">
                {bulkCreate.data.failed.length} item(ns) não foram criados — corrija e tente de novo (SKU único, ex.):
              </p>
              <ul className="list-inside list-disc">
                {bulkCreate.data.failed.map((f) => (
                  <li key={f.externalSku}>
                    <span className="font-medium">{f.externalSku}</span>: {f.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={selected.size === data.length} onCheckedChange={toggleAll} aria-label="Selecionar tudo" />
                </TableHead>
                <TableHead>Produto TikTok</TableHead>
                <TableHead>SKU TikTok</TableHead>
                <TableHead>SKU vendedor</TableHead>
                <TableHead>Estoque TikTok</TableHead>
                <TableHead>Vínculo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((product) => (
                <TableRow key={product.externalSku}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(product.externalSku)}
                      onCheckedChange={() => toggleOne(product.externalSku)}
                      aria-label={`Selecionar ${product.name}`}
                    />
                  </TableCell>
                  <TableCell>{product.name}</TableCell>
                  <TableCell>{product.externalSku}</TableCell>
                  <TableCell>{product.sellerSku ?? '—'}</TableCell>
                  <TableCell>{product.stock}</TableCell>
                  <TableCell>
                    {product.ambiguous ? (
                      <Badge tone="warning">Revisão necessária</Badge>
                    ) : product.suggestedVariantId ? (
                      <Badge tone="info">Sugestão disponível</Badge>
                    ) : (
                      <Badge tone="muted">Sem sugestão</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setLinking(product)}>
                        Vincular
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setCreating(product)}>
                        Criar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={ignore.isPending}
                        onClick={() =>
                          ignore.mutate({ externalSku: product.externalSku, externalProductId: product.externalProductId })
                        }
                      >
                        Ignorar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {linking && (
        <TikTokLinkProductDialog product={linking} open={Boolean(linking)} onOpenChange={(open) => !open && setLinking(null)} />
      )}
      {creating && (
        <TikTokCreateProductDialog product={creating} open={Boolean(creating)} onOpenChange={(open) => !open && setCreating(null)} />
      )}
    </div>
  );
}
