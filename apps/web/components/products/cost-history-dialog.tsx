'use client';

import * as React from 'react';
import { History } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import { formatBRL } from '@ecommerce-manager/shared';
import { formatDate, toDateInputValue } from '@/lib/format';
import { useCostHistory, useCreateCostHistory } from '@/hooks/use-products';

export function CostHistoryDialog({
  productId,
  variantId,
  sku,
  trigger,
}: {
  productId: string;
  variantId: string;
  sku: string;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = React.useState(false);
  const { data: history } = useCostHistory(open ? variantId : undefined);
  const createCostHistory = useCreateCostHistory(productId, variantId);

  const [form, setForm] = React.useState({ cost: '', effectiveDate: toDateInputValue(new Date()), note: '' });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createCostHistory.mutateAsync({
      cost: Number(form.cost),
      effectiveDate: form.effectiveDate,
      note: form.note || undefined,
    });
    setForm({ cost: '', effectiveDate: toDateInputValue(new Date()), note: '' });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger as any}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Histórico de custos — {sku}</DialogTitle>
        </DialogHeader>

        <div className="max-h-56 space-y-2 overflow-y-auto">
          {!history || history.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <History className="h-4 w-4" /> Nenhum custo registrado ainda.
            </p>
          ) : (
            history.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{formatDate(entry.effectiveDate)}</span>
                <span className="font-medium">{formatBRL(entry.cost)}</span>
              </div>
            ))
          )}
        </div>

        <Separator />

        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm font-medium">Registrar novo custo</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cost">Custo (R$)</Label>
              <Input
                id="cost"
                type="number"
                step="0.01"
                min="0"
                required
                value={form.cost}
                onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="effectiveDate">Data</Label>
              <Input
                id="effectiveDate"
                type="date"
                required
                value={form.effectiveDate}
                onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createCostHistory.isPending}>
              {createCostHistory.isPending ? 'Salvando...' : 'Registrar custo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
