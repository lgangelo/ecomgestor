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
import { useCreateMovement } from '@/hooks/use-inventory';

const MOVEMENT_TYPES = [
  { value: 'ADJUSTMENT', label: 'Ajuste (pode ser positivo ou negativo)' },
  { value: 'DAMAGE', label: 'Avaria' },
  { value: 'LOSS', label: 'Perda' },
  { value: 'RESERVATION', label: 'Reserva' },
  { value: 'RELEASE', label: 'Liberação de reserva' },
];

export function MovementFormDialog({
  variantId,
  sku,
  trigger,
}: {
  variantId?: string;
  sku?: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const createMovement = useCreateMovement();

  const [form, setForm] = React.useState({
    variantId: variantId ?? '',
    type: 'ADJUSTMENT',
    quantity: '',
    note: '',
  });

  React.useEffect(() => {
    if (variantId) setForm((f) => ({ ...f, variantId }));
  }, [variantId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createMovement.mutateAsync({
      variantId: form.variantId,
      type: form.type,
      quantity: Number(form.quantity),
      note: form.note || undefined,
    });
    setOpen(false);
    setForm({ variantId: variantId ?? '', type: 'ADJUSTMENT', quantity: '', note: '' });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova movimentação {sku ? `— ${sku}` : ''}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!variantId && (
            <div className="space-y-1.5">
              <Label htmlFor="variantId">ID da variante (SKU)</Label>
              <Input
                id="variantId"
                required
                placeholder="Cole o ID da variante"
                value={form.variantId}
                onChange={(e) => setForm((f) => ({ ...f, variantId: e.target.value }))}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOVEMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quantity">
              Quantidade {form.type === 'ADJUSTMENT' && '(use valor negativo para reduzir)'}
            </Label>
            <Input
              id="quantity"
              type="number"
              required
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">Observação</Label>
            <Textarea id="note" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createMovement.isPending}>
              {createMovement.isPending ? 'Salvando...' : 'Registrar movimentação'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
