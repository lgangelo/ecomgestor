'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useProduct, useProducts } from '@/hooks/use-products';
import { useLinkTikTokProduct } from '@/hooks/use-tiktok';
import type { UnmatchedTikTokProduct } from '@/hooks/use-tiktok';

export function TikTokLinkProductDialog({
  product,
  open,
  onOpenChange,
}: {
  product: UnmatchedTikTokProduct;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = React.useState('');
  const [selectedProductId, setSelectedProductId] = React.useState<string | undefined>();
  const { data: results } = useProducts({ search: query, pageSize: 8 });
  const { data: selectedProduct } = useProduct(selectedProductId);
  const link = useLinkTikTokProduct();

  const confirmLink = (variantId: string) => {
    link.mutate(
      { externalSku: product.externalSku, externalProductId: product.externalProductId, variantId },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vincular produto TikTok</DialogTitle>
          <DialogDescription>
            {product.name} ({product.externalSku})
          </DialogDescription>
        </DialogHeader>

        {product.suggestedVariantId && (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            Sugestão automática: SKU interno <strong>{product.suggestedSku}</strong> coincide com o seller SKU
            informado pela TikTok.
            <div className="mt-2">
              <Button size="sm" onClick={() => confirmLink(product.suggestedVariantId!)} disabled={link.isPending}>
                Confirmar vínculo sugerido
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="tiktok-link-search">Ou busque o produto interno</Label>
          <Input
            id="tiktok-link-search"
            placeholder="Nome ou SKU"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedProductId(undefined);
            }}
          />
        </div>

        {!selectedProductId && results && results.items.length > 0 && (
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {results.items.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedProductId(p.id)}
                className="w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted"
              >
                {p.name} <span className="text-muted-foreground">({p.baseSku})</span>
              </button>
            ))}
          </div>
        )}

        {selectedProduct && (
          <div className="space-y-1">
            <p className="text-sm font-medium">Escolha a variante:</p>
            {selectedProduct.variants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                onClick={() => confirmLink(variant.id)}
                disabled={link.isPending}
                className="w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted"
              >
                {variant.sku}
              </button>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
