'use client';

import * as React from 'react';
import { Package } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTikTokUnmatchedProducts, useIgnoreTikTokProduct } from '@/hooks/use-tiktok';
import type { UnmatchedTikTokProduct } from '@/hooks/use-tiktok';
import { TikTokLinkProductDialog } from './tiktok-link-product-dialog';

export function TikTokProductsTab() {
  const { data, isLoading } = useTikTokUnmatchedProducts(true);
  const ignore = useIgnoreTikTokProduct();
  const [linking, setLinking] = React.useState<UnmatchedTikTokProduct | null>(null);

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
        <Table>
          <TableHeader>
            <TableRow>
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
      )}

      {linking && (
        <TikTokLinkProductDialog product={linking} open={Boolean(linking)} onOpenChange={(open) => !open && setLinking(null)} />
      )}
    </div>
  );
}
