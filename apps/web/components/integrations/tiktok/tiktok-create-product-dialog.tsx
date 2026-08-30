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
import { useCreateTikTokProduct } from '@/hooks/use-tiktok';
import type { UnmatchedTikTokProduct } from '@/hooks/use-tiktok';

export function TikTokCreateProductDialog({
  product,
  open,
  onOpenChange,
}: {
  product: UnmatchedTikTokProduct;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateTikTokProduct();
  const [form, setForm] = React.useState({
    name: product.name,
    sku: product.sellerSku ?? product.externalSku,
    price: product.price,
  });

  React.useEffect(() => {
    if (open) {
      setForm({ name: product.name, sku: product.sellerSku ?? product.externalSku, price: product.price });
    }
  }, [open, product]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await create.mutateAsync(
      {
        externalSku: product.externalSku,
        externalProductId: product.externalProductId,
        name: form.name,
        sku: form.sku,
        price: form.price,
        stock: product.stock,
        imageUrl: product.imageUrl,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar produto interno a partir da TikTok</DialogTitle>
          <DialogDescription>
            Cria um produto novo no sistema usando os dados da TikTok como cadastro de partida — não exige um
            produto interno existente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="create-name">Nome</Label>
            <Input id="create-name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="create-sku">SKU interno</Label>
            <Input id="create-sku" required value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="create-price">Preço</Label>
            <Input
              id="create-price"
              required
              inputMode="decimal"
              placeholder="0.00"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Criando...' : 'Criar produto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
