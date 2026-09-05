'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
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
import { toDateInputValue } from '@/lib/format';
import { useCreateExpense, useExpenseCategories } from '@/hooks/use-finance';
import { ExpenseCategoryFormDialog } from './expense-category-form-dialog';

export function ExpenseFormDialog({ trigger }: { trigger: React.ReactElement }) {
  const [open, setOpen] = React.useState(false);
  const { data: categories } = useExpenseCategories();
  const createExpense = useCreateExpense();

  const [form, setForm] = React.useState({
    categoryId: '',
    description: '',
    amount: '',
    date: toDateInputValue(new Date()),
    paymentMethod: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createExpense.mutateAsync({
      categoryId: form.categoryId,
      description: form.description,
      amount: Number(form.amount),
      date: form.date,
      paymentMethod: form.paymentMethod || undefined,
    });
    setOpen(false);
    setForm({ categoryId: '', description: '', amount: '', date: toDateInputValue(new Date()), paymentMethod: '' });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger as any}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova despesa</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <div className="flex gap-2">
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
              <ExpenseCategoryFormDialog
                onCreated={(category) => setForm((f) => ({ ...f, categoryId: category.id }))}
                trigger={
                  <Button type="button" variant="outline" size="icon" aria-label="Nova categoria">
                    <Plus className="h-4 w-4" />
                  </Button>
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Descrição</Label>
            <Input
              id="description"
              required
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Valor (R$)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date">Data</Label>
              <Input
                id="date"
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="paymentMethod">Forma de pagamento</Label>
            <Input
              id="paymentMethod"
              value={form.paymentMethod}
              onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!form.categoryId || createExpense.isPending}>
              {createExpense.isPending ? 'Salvando...' : 'Registrar despesa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
