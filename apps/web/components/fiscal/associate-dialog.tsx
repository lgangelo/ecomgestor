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
import { useAssociateFiscalDocument } from '@/hooks/use-fiscal';

export function AssociateFiscalDocumentDialog({
  documentId,
  trigger,
}: {
  documentId: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [orderId, setOrderId] = React.useState('');
  const associate = useAssociateFiscalDocument();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await associate.mutateAsync({ documentId, orderId });
    setOpen(false);
    setOrderId('');
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Associar a um pedido</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="orderId">ID do pedido</Label>
            <Input id="orderId" required value={orderId} onChange={(e) => setOrderId(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={associate.isPending}>
              {associate.isPending ? 'Associando...' : 'Associar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
