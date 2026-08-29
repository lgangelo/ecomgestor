'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUpdateVariant } from '@/hooks/use-products';
import type { ProductVariantDetail } from '@/hooks/use-products';

export function VariantEditDialog({
  productId,
  variant,
  trigger,
}: {
  productId: string;
  variant: ProductVariantDetail;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const updateVariant = useUpdateVariant(productId, variant.id);

  const [form, setForm] = React.useState({
    sku: variant.sku,
    barcode: variant.barcode ?? '',
    color: variant.color ?? '',
    size: variant.size ?? '',
    suggestedPrice: variant.suggestedPrice,
    minStock: String(variant.minStock),
  });

  React.useEffect(() => {
    if (open) {
      setForm({
        sku: variant.sku,
        barcode: variant.barcode ?? '',
        color: variant.color ?? '',
        size: variant.size ?? '',
        suggestedPrice: variant.suggestedPrice,
        minStock: String(variant.minStock),
      });
    }
  }, [open, variant]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await updateVariant.mutateAsync({
      sku: form.sku,
      barcode: form.barcode || undefined,
      color: form.color || undefined,
      size: form.size || undefined,
      suggestedPrice: Number(form.suggestedPrice),
      minStock: Number(form.minStock),
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar variação (SKU)</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-sku">SKU</Label>
              <Input id="edit-sku" required value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-barcode">Código de barras</Label>
              <Input
                id="edit-barcode"
                value={form.barcode}
                onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-color">Cor</Label>
              <Input id="edit-color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-size">Tamanho</Label>
              <Input id="edit-size" value={form.size} onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-suggestedPrice">Preço sugerido (R$)</Label>
              <Input
                id="edit-suggestedPrice"
                type="number"
                step="0.01"
                min="0"
                required
                value={form.suggestedPrice}
                onChange={(e) => setForm((f) => ({ ...f, suggestedPrice: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-minStock">Estoque mínimo</Label>
              <Input
                id="edit-minStock"
                type="number"
                min="0"
                value={form.minStock}
                onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={updateVariant.isPending}>
              {updateVariant.isPending ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
