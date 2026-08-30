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
import { useClearFailedJobs } from '@/hooks/use-jobs';

export function ClearFailedJobsDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const clearFailedJobs = useClearFailedJobs();

  async function handleConfirm() {
    await clearFailedJobs.mutateAsync(undefined, { onSuccess: () => setOpen(false) });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Limpar jobs com falha</DialogTitle>
          <DialogDescription>
            Remove permanentemente do histórico todos os jobs com status <strong>FAILED</strong>. Jobs pendentes,
            em execução ou concluídos não são afetados. Essa ação não pode ser desfeita.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={clearFailedJobs.isPending} onClick={handleConfirm}>
            {clearFailedJobs.isPending ? 'Limpando...' : 'Limpar falhas'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
