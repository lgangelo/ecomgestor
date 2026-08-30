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
import { toDateInputValue } from '@/lib/format';
import { useCreateCostHistoryForProduct } from '@/hooks/use-products';

export function ProductCostDialog({
  productId,
  variantCount,
  trigger,
}: {
  productId: string;
  variantCount: number;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const createCost = useCreateCostHistoryForProduct(productId);

  const [form, setForm] = React.useState({ cost: '', effectiveDate: toDateInputValue(new Date()), note: '' });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createCost.mutateAsync({
      cost: Number(form.cost),
      effectiveDate: form.effectiveDate,
      note: form.note || undefined,
    });
    setOpen(false);
    setForm({ cost: '', effectiveDate: toDateInputValue(new Date()), note: '' });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Definir custo do produto</DialogTitle>
          {variantCount > 1 && (
            <DialogDescription>
              Aplica o mesmo custo às {variantCount} variações deste produto. Se o custo variar por
              variação (ex.: por tamanho), registre individualmente pelo botão de custo na tabela de
              variações em vez deste.
            </DialogDescription>
          )}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="product-cost">Custo (R$)</Label>
              <Input
                id="product-cost"
                type="number"
                step="0.01"
                min="0"
                required
                value={form.cost}
                onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-cost-date">Data</Label>
              <Input
                id="product-cost-date"
                type="date"
                required
                value={form.effectiveDate}
                onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createCost.isPending}>
              {createCost.isPending ? 'Salvando...' : 'Registrar custo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
