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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import type { OrderItemDetail } from '@/hooks/use-orders';
import { useCreateReturn } from '@/hooks/use-returns';

export function RegisterReturnDialog({
  orderId,
  items,
  trigger,
}: {
  orderId: string;
  items: OrderItemDetail[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [selected, setSelected] = React.useState<Record<string, number>>({});
  const createReturn = useCreateReturn(orderId);

  function toggle(itemId: string, quantity: number) {
    setSelected((s) => {
      const next = { ...s };
      if (itemId in next) delete next[itemId];
      else next[itemId] = quantity;
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createReturn.mutateAsync({
      reason: reason || undefined,
      items: Object.entries(selected).map(([orderItemId, quantity]) => ({ orderItemId, quantity })),
    });
    setOpen(false);
    setSelected({});
    setReason('');
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar devolução</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Itens devolvidos</Label>
            {items.map((item) => (
              <label key={item.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={item.id in selected}
                  onCheckedChange={() => toggle(item.id, item.quantity)}
                />
                {item.productName} ({item.sku}) — {item.quantity} un.
              </label>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Motivo</Label>
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createReturn.isPending || Object.keys(selected).length === 0}>
              {createReturn.isPending ? 'Registrando...' : 'Registrar devolução'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
