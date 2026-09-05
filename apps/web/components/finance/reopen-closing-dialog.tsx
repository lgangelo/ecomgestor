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
import { useReopenClosing } from '@/hooks/use-finance';

export function ReopenClosingDialog({ closingId, trigger }: { closingId: string; trigger: React.ReactElement }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const reopen = useReopenClosing();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await reopen.mutateAsync({ id: closingId, reason });
    setOpen(false);
    setReason('');
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild onClick={(e) => e.stopPropagation()}>
        {trigger as any}
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Reabrir período</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Reabrir um período fechado é auditado e exige um motivo.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Motivo</Label>
            <Textarea id="reason" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={reopen.isPending}>
              {reopen.isPending ? 'Reabrindo...' : 'Reabrir período'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
