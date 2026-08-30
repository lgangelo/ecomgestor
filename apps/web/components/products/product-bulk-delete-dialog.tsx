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
import { useBulkDeleteProducts } from '@/hooks/use-products';

export function ProductBulkDeleteDialog({
  ids,
  trigger,
  onDeleted,
}: {
  ids: string[];
  trigger: React.ReactNode;
  onDeleted: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const bulkDelete = useBulkDeleteProducts();

  async function handleConfirm() {
    await bulkDelete.mutateAsync(ids, {
      onSuccess: () => {
        setOpen(false);
        onDeleted();
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir {ids.length} produto(s)</DialogTitle>
          <DialogDescription>
            Tem certeza que deseja excluir estes <strong>{ids.length}</strong> produto(s)? Isso só remove do
            sistema — não afeta nenhuma integração (ex.: TikTok Shop). Produtos que já têm pedido ou movimentação de
            estoque registrada não serão excluídos (ficam de fora automaticamente, sem travar os demais).
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={bulkDelete.isPending} onClick={handleConfirm}>
            {bulkDelete.isPending ? 'Excluindo...' : `Excluir ${ids.length} produto(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
