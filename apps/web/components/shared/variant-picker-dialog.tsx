'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatBRL } from '@ecommerce-manager/shared';
import { useProducts, useProduct } from '@/hooks/use-products';

export interface PickedVariant {
  variantId: string;
  sku: string;
  productName: string;
  suggestedPrice: number;
}

export function VariantPickerDialog({
  trigger,
  onPick,
}: {
  trigger: React.ReactNode;
  onPick: (variant: PickedVariant) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [selectedProductId, setSelectedProductId] = React.useState<string | undefined>();

  const { data: products } = useProducts({ search, pageSize: 10 });
  const { data: product } = useProduct(selectedProductId);

  function handlePick(variantId: string, sku: string, suggestedPrice: string) {
    if (!product) return;
    onPick({ variantId, sku, productName: product.name, suggestedPrice: Number(suggestedPrice) });
    setOpen(false);
    setSelectedProductId(undefined);
    setSearch('');
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Selecionar produto e variação</DialogTitle>
        </DialogHeader>

        {!selectedProductId ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Buscar produto por nome ou SKU..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {products?.items.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">Nenhum produto encontrado.</p>
              )}
              {products?.items.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProductId(p.id)}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span>
                    <span className="font-medium">{p.name}</span>{' '}
                    <span className="text-muted-foreground">({p.baseSku})</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{p.variantCount} SKU(s)</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Button variant="ghost" size="sm" onClick={() => setSelectedProductId(undefined)}>
              ← Voltar para busca
            </Button>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {product?.variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => handlePick(v.id, v.sku, v.suggestedPrice)}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span>
                    <span className="font-medium">{v.sku}</span>{' '}
                    <span className="text-muted-foreground">
                      {[v.color, v.size].filter(Boolean).join(' / ')}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatBRL(v.suggestedPrice)} · {v.inventory.available} disp.
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
