'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useStartTikTokImport } from '@/hooks/use-tiktok';

export function TikTokImportWizardDialog({ trigger }: { trigger: React.ReactElement }) {
  const [open, setOpen] = React.useState(false);
  const [importProducts, setImportProducts] = React.useState(true);
  const [importOrders, setImportOrders] = React.useState(true);
  const [ordersSince, setOrdersSince] = React.useState('');
  const start = useStartTikTokImport();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger as any}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conta TikTok conectada</DialogTitle>
          <DialogDescription>O que deseja importar? A importação roda em segundo plano.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={importProducts} onCheckedChange={(v) => setImportProducts(Boolean(v))} />
            Produtos
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={importOrders} onCheckedChange={(v) => setImportOrders(Boolean(v))} />
            Pedidos
          </label>
          {importOrders && (
            <div className="space-y-1.5 pl-6">
              <Label htmlFor="orders-since">Pedidos desde</Label>
              <Input id="orders-since" type="date" value={ordersSince} onChange={(e) => setOrdersSince(e.target.value)} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            disabled={start.isPending || (!importProducts && !importOrders)}
            onClick={() =>
              start.mutate(
                { importProducts, importOrders, ordersSince: ordersSince ? new Date(ordersSince).toISOString() : undefined },
                { onSuccess: () => setOpen(false) },
              )
            }
          >
            Iniciar importação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
