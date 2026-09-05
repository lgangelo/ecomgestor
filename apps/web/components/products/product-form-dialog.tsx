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
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { useCategories } from '@/hooks/use-categories';
import { useCreateProduct } from '@/hooks/use-products';
import { useGenerateProductCopy } from '@/hooks/use-ai-copy';
import { ImageUploadField } from './image-upload-field';

export function ProductFormDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const { data: categories } = useCategories();
  const createProduct = useCreateProduct();
  const generateCopy = useGenerateProductCopy();
  const queryClient = useQueryClient();
  const [imageFile, setImageFile] = React.useState<File | null>(null);

  const [form, setForm] = React.useState({
    name: '',
    baseSku: '',
    brand: '',
    description: '',
    categoryId: '',
    status: 'DRAFT',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const product = await createProduct.mutateAsync({
      name: form.name,
      baseSku: form.baseSku,
      brand: form.brand || undefined,
      description: form.description || undefined,
      categoryId: form.categoryId || undefined,
      status: form.status,
    });
    // Só dá pra anexar a foto depois que o produto já existe (precisa do id), por isso é uma
    // chamada separada em vez de ir junto no corpo de `createProduct`.
    if (imageFile) {
      const body = new FormData();
      body.append('file', imageFile);
      await apiFetch(`/products/${product.id}/image`, { method: 'POST', body });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    }
    setOpen(false);
    setImageFile(null);
    setForm({ name: '', baseSku: '', brand: '', description: '', categoryId: '', status: 'DRAFT' });
  }

  async function handleGenerateCopy() {
    const categoryName = categories?.find((c) => c.id === form.categoryId)?.name;
    const result = await generateCopy.mutateAsync({
      titleHint: form.name || undefined,
      descriptionHint: form.description || undefined,
      category: categoryName,
      brand: form.brand || undefined,
      image: imageFile ?? undefined,
    });
    // Sugestão editável — preenche os campos, mas o usuário ainda pode ajustar antes de salvar.
    setForm((f) => ({ ...f, name: result.title, description: result.description }));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo produto</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="baseSku">SKU base</Label>
              <Input
                id="baseSku"
                required
                value={form.baseSku}
                onChange={(e) => setForm((f) => ({ ...f, baseSku: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand">Marca</Label>
              <Input
                id="brand"
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
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
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
            <div className="col-span-2">
              <ImageUploadField id="coverImageFile" label="Foto de capa (opcional)" onFileSelect={setImageFile} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="description">Descrição</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={generateCopy.isPending || (!form.name && !form.description)}
                  onClick={handleGenerateCopy}
                >
                  <Sparkles className="h-4 w-4" />
                  {generateCopy.isPending ? 'Gerando...' : 'Gerar com IA'}
                </Button>
              </div>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Preenche nome e descrição a partir do que já foi digitado (e da foto, se enviada) — revise antes de
                salvar.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createProduct.isPending}>
              {createProduct.isPending ? 'Salvando...' : 'Criar produto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
