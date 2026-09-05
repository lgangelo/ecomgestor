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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatBRL } from '@ecommerce-manager/shared';
import { formatDate } from '@/lib/format';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useAssociateFiscalDocument } from '@/hooks/use-fiscal';
import { useOrders } from '@/hooks/use-orders';
import { useReturns } from '@/hooks/use-returns';

function OrderPicker({ onSelect }: { onSelect: (orderId: string) => void }) {
  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const { data, isFetching } = useOrders({ externalOrderId: debouncedSearch || undefined, pageSize: 5 });

  return (
    <div className="space-y-2">
      <Label htmlFor="order-search">Número do pedido</Label>
      <Input
        id="order-search"
        placeholder="Digite o número do pedido"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {debouncedSearch && (
        <div className="max-h-60 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {isFetching ? (
            <p className="p-3 text-sm text-muted-foreground">Buscando...</p>
          ) : data && data.items.length > 0 ? (
            data.items.map((order) => (
              <button
                type="button"
                key={order.id}
                onClick={() => onSelect(order.id)}
                className="flex w-full items-center justify-between p-3 text-left text-sm hover:bg-muted"
              >
                <span>
                  <span className="font-medium">{order.externalOrderId ?? order.id.slice(0, 8)}</span>
                  {order.customerName && <span className="text-muted-foreground"> · {order.customerName}</span>}
                  <span className="block text-xs text-muted-foreground">{formatDate(order.orderDate, true)}</span>
                </span>
                <span className="font-medium">{formatBRL(order.total)}</span>
              </button>
            ))
          ) : (
            <p className="p-3 text-sm text-muted-foreground">Nenhum pedido encontrado.</p>
          )}
        </div>
      )}
    </div>
  );
}

function ReturnPicker({ onSelect }: { onSelect: (returnId: string) => void }) {
  const [search, setSearch] = React.useState('');
  const { data } = useReturns({ pageSize: 100 });

  const filtered = React.useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    if (!term) return data.items;
    return data.items.filter(
      (r) => r.customerName?.toLowerCase().includes(term) || r.reason?.toLowerCase().includes(term),
    );
  }, [data, search]);

  return (
    <div className="space-y-2">
      <Label htmlFor="return-search">Cliente ou motivo da devolução</Label>
      <Input
        id="return-search"
        placeholder="Filtrar devoluções"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="max-h-60 divide-y divide-border overflow-y-auto rounded-md border border-border">
        {filtered.length > 0 ? (
          filtered.map((ret) => (
            <button
              type="button"
              key={ret.id}
              onClick={() => onSelect(ret.id)}
              className="flex w-full items-center justify-between p-3 text-left text-sm hover:bg-muted"
            >
              <span>
                <span className="font-medium">{ret.customerName ?? 'Cliente não identificado'}</span>
                <span className="block text-xs text-muted-foreground">
                  {ret.reason ?? 'Sem motivo informado'} · {formatDate(ret.requestedAt, true)}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">{ret.status}</span>
            </button>
          ))
        ) : (
          <p className="p-3 text-sm text-muted-foreground">Nenhuma devolução encontrada.</p>
        )}
      </div>
    </div>
  );
}

export function AssociateFiscalDocumentDialog({
  documentId,
  trigger,
}: {
  documentId: string;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = React.useState(false);
  const associate = useAssociateFiscalDocument();

  async function handleSelectOrder(orderId: string) {
    await associate.mutateAsync({ documentId, orderId });
    setOpen(false);
  }

  async function handleSelectReturn(returnId: string) {
    await associate.mutateAsync({ documentId, returnId });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger as any}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Associar documento fiscal</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="order">
          <TabsList>
            <TabsTrigger value="order">Pedido</TabsTrigger>
            <TabsTrigger value="return">Devolução</TabsTrigger>
          </TabsList>
          <TabsContent value="order" className="pt-4">
            <OrderPicker onSelect={handleSelectOrder} />
          </TabsContent>
          <TabsContent value="return" className="pt-4">
            <ReturnPicker onSelect={handleSelectReturn} />
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
