'use client';

import * as React from 'react';
import { Pencil, Settings } from 'lucide-react';
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
import { useExpenseCategories, useUpdateExpenseCategory, type ExpenseCategory } from '@/hooks/use-finance';

function ExpenseCategoryRow({ category }: { category: ExpenseCategory }) {
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(category.name);
  const updateCategory = useUpdateExpenseCategory(category.id);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    await updateCategory.mutateAsync({ name }, { onSuccess: () => setEditing(false) });
  }

  if (editing) {
    return (
      <form onSubmit={handleSave} className="flex items-center gap-2 py-1">
        <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className="h-8" />
        <Button type="submit" size="sm" disabled={updateCategory.isPending}>
          Salvar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setName(category.name);
            setEditing(false);
          }}
        >
          Cancelar
        </Button>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-sm">{category.name}</span>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
        <Pencil className="h-4 w-4" />
        Editar
      </Button>
    </div>
  );
}

export function ExpenseCategoryManageDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const { data: categories } = useExpenseCategories();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {(trigger ?? (
          <Button type="button" variant="outline" size="icon" aria-label="Gerenciar categorias">
            <Settings className="h-4 w-4" />
          </Button>
        )) as any}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Categorias de despesa</DialogTitle>
        </DialogHeader>
        <div className="divide-y divide-border">
          {categories?.length ? (
            categories.map((category) => <ExpenseCategoryRow key={category.id} category={category} />)
          ) : (
            <p className="py-2 text-sm text-muted-foreground">Nenhuma categoria cadastrada.</p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
