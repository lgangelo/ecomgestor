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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { OrderItemDetail } from '@/hooks/use-orders';
import { useCreateReturn } from '@/hooks/use-returns';

const CONDITIONS = [
  { value: 'NEW', label: 'Novo' },
  { value: 'USED', label: 'Usado' },
  { value: 'DAMAGED', label: 'Danificado' },
  { value: 'LOST', label: 'Perdido' },
];

interface SelectedItem {
  quantity: number;
  condition: string;
  restockOnReturn: boolean;
}

export function RegisterReturnDialog({
  orderId,
  items,
  trigger,
}: {
  orderId: string;
  items: OrderItemDetail[];
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [selected, setSelected] = React.useState<Record<string, SelectedItem>>({});
  const createReturn = useCreateReturn(orderId);

  function toggle(itemId: string, quantity: number) {
    setSelected((s) => {
      const next = { ...s };
      if (itemId in next) delete next[itemId];
      else next[itemId] = { quantity, condition: 'NEW', restockOnReturn: false };
      return next;
    });
  }

  function updateItem(itemId: string, patch: Partial<SelectedItem>) {
    setSelected((s) => ({ ...s, [itemId]: { ...s[itemId], ...patch } }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createReturn.mutateAsync({
      reason: reason || undefined,
      items: Object.entries(selected).map(([orderItemId, item]) => ({
        orderItemId,
        quantity: item.quantity,
        condition: item.condition,
        restockOnReturn: item.restockOnReturn,
      })),
    });
    setOpen(false);
    setSelected({});
    setReason('');
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger as any}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar devolução</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <Label>Itens devolvidos</Label>
            {items.map((item) => {
              const isSelected = item.id in selected;
              return (
                <div key={item.id} className="space-y-2 rounded-md border border-border p-3">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={isSelected} onCheckedChange={() => toggle(item.id, item.quantity)} />
                    {item.productName} ({item.sku}) — {item.quantity} un.
                  </label>
                  {isSelected && (
                    <div className="grid grid-cols-2 gap-3 pl-6">
                      <div className="space-y-1">
                        <Label className="text-xs">Condição do item</Label>
                        <Select
                          value={selected[item.id].condition}
                          onValueChange={(v) => updateItem(item.id, { condition: v })}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONDITIONS.map((c) => (
                              <SelectItem key={c.value} value={c.value}>
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <label className="flex items-center gap-2 self-end pb-1.5 text-sm">
                        <Checkbox
                          checked={selected[item.id].restockOnReturn}
                          onCheckedChange={(v) => updateItem(item.id, { restockOnReturn: Boolean(v) })}
                        />
                        Retorna ao estoque?
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
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
