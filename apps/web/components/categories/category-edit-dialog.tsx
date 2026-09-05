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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCategories, useUpdateCategory, type Category } from '@/hooks/use-categories';

export function CategoryEditDialog({ category, trigger }: { category: Category; trigger: React.ReactElement }) {
  const [open, setOpen] = React.useState(false);
  const { data: categories } = useCategories();
  const updateCategory = useUpdateCategory(category.id);

  const [name, setName] = React.useState(category.name);
  const [parentId, setParentId] = React.useState(category.parentId ?? '');

  React.useEffect(() => {
    if (open) {
      setName(category.name);
      setParentId(category.parentId ?? '');
    }
  }, [open, category]);

  // Uma categoria não pode ser pai de si mesma, nem virar filha de uma das suas próprias
  // subcategorias diretas — a API já bloqueia o primeiro caso; aqui só nem oferece as duas opções.
  const parentOptions = categories?.filter((c) => c.id !== category.id) ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await updateCategory.mutateAsync({ name, parentId: parentId || null });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger as any}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar categoria</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-category-name">Nome</Label>
            <Input id="edit-category-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Categoria pai (opcional)</Label>
            <Select value={parentId || 'none'} onValueChange={(v) => setParentId(v === 'none' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Nenhuma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
                {parentOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={updateCategory.isPending}>
              {updateCategory.isPending ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
