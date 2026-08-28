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
import { useCreateRefund } from '@/hooks/use-returns';

export function RegisterRefundDialog({ returnId, trigger }: { returnId: string; trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const createRefund = useCreateRefund(returnId);

  const [type, setType] = React.useState<'FULL' | 'PARTIAL'>('FULL');
  const [amount, setAmount] = React.useState('');
  const [method, setMethod] = React.useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createRefund.mutateAsync({ type, amount: Number(amount), method: method || undefined });
    setOpen(false);
    setAmount('');
    setMethod('');
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar reembolso</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            O reembolso financeiro é separado do retorno físico da mercadoria — registrar aqui não altera o estoque.
          </p>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as 'FULL' | 'PARTIAL')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FULL">Total</SelectItem>
                <SelectItem value="PARTIAL">Parcial</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="amount">Valor (R$)</Label>
            <Input
              id="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="method">Forma de reembolso</Label>
            <Input
              id="method"
              placeholder="Ex: Estorno no cartão, Pix"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createRefund.isPending}>
              {createRefund.isPending ? 'Registrando...' : 'Registrar reembolso'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
