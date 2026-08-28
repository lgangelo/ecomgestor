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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ORDER_STATUS_PRESENTATION } from '@ecommerce-manager/ui';
import { useUpdateOrderStatus } from '@/hooks/use-orders';

const STATUSES = Object.keys(ORDER_STATUS_PRESENTATION);

export function UpdateStatusDialog({ orderId, trigger }: { orderId: string; trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [note, setNote] = React.useState('');
  const updateStatus = useUpdateOrderStatus(orderId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await updateStatus.mutateAsync({ status, note: note || undefined });
    setOpen(false);
    setNote('');
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atualizar status do pedido</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Novo status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {ORDER_STATUS_PRESENTATION[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">Observação</Label>
            <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!status || updateStatus.isPending}>
              {updateStatus.isPending ? 'Salvando...' : 'Atualizar status'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
