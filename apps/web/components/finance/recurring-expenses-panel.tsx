'use client';

import * as React from 'react';
import { Plus, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { formatBRL } from '@ecommerce-manager/shared';
import { useExpenseCategories } from '@/hooks/use-finance';
import {
  useCreateRecurringExpense,
  useRecurringExpenses,
  useSetRecurringExpenseActive,
} from '@/hooks/use-finance';
import { EmptyState } from '@/components/shared/empty-state';
import { ExpenseCategoryFormDialog } from './expense-category-form-dialog';

export function RecurringExpensesPanel() {
  const { data: templates, isLoading } = useRecurringExpenses();
  const { data: categories } = useExpenseCategories();
  const createTemplate = useCreateRecurringExpense();
  const setActive = useSetRecurringExpenseActive();

  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ categoryId: '', description: '', amount: '', dayOfMonth: '1' });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createTemplate.mutateAsync({
      categoryId: form.categoryId,
      description: form.description,
      amount: Number(form.amount),
      dayOfMonth: Number(form.dayOfMonth),
    });
    setOpen(false);
    setForm({ categoryId: '', description: '', amount: '', dayOfMonth: '1' });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              Nova despesa recorrente
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova despesa recorrente</DialogTitle>
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
                    min="0.01"
                    step="0.01"
                    required
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dayOfMonth">Dia do mês</Label>
                  <Input
                    id="dayOfMonth"
                    type="number"
                    min="1"
                    max="28"
                    required
                    value={form.dayOfMonth}
                    onChange={(e) => setForm((f) => ({ ...f, dayOfMonth: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={!form.categoryId || createTemplate.isPending}>
                  {createTemplate.isPending ? 'Salvando...' : 'Criar'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading || !templates ? null : templates.length === 0 ? (
        <EmptyState icon={Repeat} title="Nenhuma despesa recorrente cadastrada" />
      ) : (
        <div className="space-y-2">
          {templates.map((template) => (
            <div key={template.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
              <div>
                <p className="font-medium">{template.description}</p>
                <p className="text-xs text-muted-foreground">
                  {template.category.name} · todo dia {template.dayOfMonth} · {formatBRL(template.amount)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{template.isActive ? 'Ativa' : 'Inativa'}</span>
                <Switch
                  checked={template.isActive}
                  onCheckedChange={(v) => setActive.mutate({ id: template.id, isActive: v })}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
