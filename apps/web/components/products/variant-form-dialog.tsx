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
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api-client';
import { useCreateVariant } from '@/hooks/use-products';
import { ImageUploadField } from './image-upload-field';

export function VariantFormDialog({ productId, trigger }: { productId: string; trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const createVariant = useCreateVariant(productId);
  const queryClient = useQueryClient();
  const [imageFile, setImageFile] = React.useState<File | null>(null);

  const [form, setForm] = React.useState({
    sku: '',
    barcode: '',
    color: '',
    size: '',
    suggestedPrice: '',
    minStock: '0',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const variant = await createVariant.mutateAsync({
      sku: form.sku,
      barcode: form.barcode || undefined,
      color: form.color || undefined,
      size: form.size || undefined,
      suggestedPrice: Number(form.suggestedPrice),
      minStock: Number(form.minStock),
    });
    if (imageFile) {
      const body = new FormData();
      body.append('file', imageFile);
      await apiFetch(`/products/variants/${(variant as { id: string }).id}/image`, { method: 'POST', body });
      queryClient.invalidateQueries({ queryKey: ['products', productId] });
    }
    setOpen(false);
    setImageFile(null);
    setForm({ sku: '', barcode: '', color: '', size: '', suggestedPrice: '', minStock: '0' });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova variação (SKU)</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" required value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="barcode">Código de barras</Label>
              <Input id="barcode" value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="color">Cor</Label>
              <Input id="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="size">Tamanho</Label>
              <Input id="size" value={form.size} onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="suggestedPrice">Preço sugerido (R$)</Label>
              <Input
                id="suggestedPrice"
                type="number"
                step="0.01"
                min="0"
                required
                value={form.suggestedPrice}
                onChange={(e) => setForm((f) => ({ ...f, suggestedPrice: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="minStock">Estoque mínimo</Label>
              <Input
                id="minStock"
                type="number"
                min="0"
                value={form.minStock}
                onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <ImageUploadField id="variantImageFile" label="Foto desta variação (opcional)" onFileSelect={setImageFile} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createVariant.isPending}>
              {createVariant.isPending ? 'Salvando...' : 'Criar variação'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
