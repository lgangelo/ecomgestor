'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
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
import { useDeleteProduct } from '@/hooks/use-products';

export function ProductDeleteDialog({
  productId,
  productName,
  trigger,
}: {
  productId: string;
  productName: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const deleteProduct = useDeleteProduct();

  async function handleConfirm() {
    await deleteProduct.mutateAsync(productId, { onSuccess: () => router.push('/produtos') });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir produto</DialogTitle>
          <DialogDescription>
            Tem certeza que deseja excluir <strong>{productName}</strong>? Isso só remove o produto do sistema — não
            afeta nenhuma integração (ex.: TikTok Shop). A exclusão é bloqueada se o produto já tiver pedidos ou
            movimentações de estoque registradas.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={deleteProduct.isPending} onClick={handleConfirm}>
            {deleteProduct.isPending ? 'Excluindo...' : 'Excluir produto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
