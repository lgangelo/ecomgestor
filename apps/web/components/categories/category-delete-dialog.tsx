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
import { useDeleteCategory } from '@/hooks/use-categories';

export function CategoryDeleteDialog({
  categoryId,
  categoryName,
  trigger,
}: {
  categoryId: string;
  categoryName: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const deleteCategory = useDeleteCategory();

  async function handleConfirm() {
    await deleteCategory.mutateAsync(categoryId, { onSuccess: () => setOpen(false) });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir categoria</DialogTitle>
          <DialogDescription>
            Tem certeza que deseja excluir <strong>{categoryName}</strong>? A exclusão é bloqueada se houver produtos
            ou subcategorias vinculados — mova-os para outra categoria primeiro.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={deleteCategory.isPending} onClick={handleConfirm}>
            {deleteCategory.isPending ? 'Excluindo...' : 'Excluir categoria'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
