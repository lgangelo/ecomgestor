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
import { useCreateExpenseCategory, type ExpenseCategory } from '@/hooks/use-finance';

export function ExpenseCategoryFormDialog({
  trigger,
  onCreated,
}: {
  trigger: React.ReactNode;
  onCreated?: (category: ExpenseCategory) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const createCategory = useCreateExpenseCategory();
  const [name, setName] = React.useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const category = await createCategory.mutateAsync({ name });
    setOpen(false);
    setName('');
    onCreated?.(category);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova categoria de despesa</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="expense-category-name">Nome</Label>
            <Input id="expense-category-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createCategory.isPending}>
              {createCategory.isPending ? 'Salvando...' : 'Criar categoria'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
