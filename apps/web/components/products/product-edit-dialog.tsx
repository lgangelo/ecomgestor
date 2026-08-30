'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCategories } from '@/hooks/use-categories';
import { useUpdateProduct, type ProductDetail } from '@/hooks/use-products';

export function ProductEditDialog({ product, trigger }: { product: ProductDetail; trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const { data: categories } = useCategories();
  const updateProduct = useUpdateProduct(product.id);

  const [form, setForm] = React.useState({
    name: product.name,
    baseSku: product.baseSku,
    brand: product.brand ?? '',
    description: product.description ?? '',
    categoryId: product.category?.id ?? '',
    imageUrl: product.imageUrl ?? '',
    status: product.status,
  });

  React.useEffect(() => {
    if (open) {
      setForm({
        name: product.name,
        baseSku: product.baseSku,
        brand: product.brand ?? '',
        description: product.description ?? '',
        categoryId: product.category?.id ?? '',
        imageUrl: product.imageUrl ?? '',
        status: product.status,
      });
    }
  }, [open, product]);

  const baseSkuChanged = form.baseSku !== product.baseSku;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await updateProduct.mutateAsync({
      name: form.name,
      baseSku: form.baseSku,
      brand: form.brand || undefined,
      description: form.description || undefined,
      categoryId: form.categoryId || undefined,
      imageUrl: form.imageUrl || undefined,
      status: form.status,
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar produto</DialogTitle>
          {product.variants.length > 1 && (
            <DialogDescription>
              Ao trocar o SKU base, as {product.variants.length} variações são renumeradas automaticamente para{' '}
              <code>{form.baseSku || 'SKU'}-1</code>, <code>{form.baseSku || 'SKU'}-2</code>, ...
            </DialogDescription>
          )}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="edit-name">Nome</Label>
              <Input
                id="edit-name"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-baseSku">SKU base</Label>
              <Input
                id="edit-baseSku"
                required
                value={form.baseSku}
                onChange={(e) => setForm((f) => ({ ...f, baseSku: e.target.value }))}
              />
              {baseSkuChanged && product.variants.length === 1 && (
                <p className="text-xs text-muted-foreground">A única variação também vai usar este SKU.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-brand">Marca</Label>
              <Input
                id="edit-brand"
                value={form.brand}
                onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as typeof form.status }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Rascunho</SelectItem>
                  <SelectItem value="ACTIVE">Ativo</SelectItem>
                  <SelectItem value="INACTIVE">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="edit-imageUrl">URL da imagem de capa</Label>
              <Input
                id="edit-imageUrl"
                placeholder="https://..."
                value={form.imageUrl}
                onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="edit-description">Descrição</Label>
              <Textarea
                id="edit-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={updateProduct.isPending}>
              {updateProduct.isPending ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
