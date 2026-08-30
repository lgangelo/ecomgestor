'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { STOCK_ENTRY_STATUS_PRESENTATION } from '@ecommerce-manager/ui';
import { formatBRL } from '@ecommerce-manager/shared';
import { formatDate } from '@/lib/format';
import { useConfirmStockEntry, useStockEntry } from '@/hooks/use-stock-entries';

export function StockEntryDetailView({ id }: { id: string }) {
  const { data: entry, isLoading } = useStockEntry(id);
  const confirmEntry = useConfirmStockEntry(id);

  if (isLoading || !entry) {
    return <Skeleton className="h-64" />;
  }

  return (
    <div>
      <Link
        href="/produtos/entradas"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para entradas
      </Link>

      <PageHeader
        title={`Entrada de ${formatDate(entry.entryDate)}`}
        description={entry.supplier?.name ?? 'Sem fornecedor informado'}
        actions={
          entry.status === 'DRAFT' && (
            <Button onClick={() => confirmEntry.mutate()} disabled={confirmEntry.isPending}>
              {confirmEntry.isPending ? 'Confirmando...' : 'Confirmar entrada'}
            </Button>
          )
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <StatusBadge status={entry.status} map={STOCK_ENTRY_STATUS_PRESENTATION} />
        {entry.skipStockMovement && (
          <span className="text-sm font-medium text-warning">Só custo — não movimenta o estoque físico</span>
        )}
        {entry.invoiceNumber && <span className="text-sm text-muted-foreground">NF: {entry.invoiceNumber}</span>}
        {Number(entry.shippingCost) > 0 && (
          <span className="text-sm text-muted-foreground">Frete: {formatBRL(entry.shippingCost)}</span>
        )}
        {Number(entry.otherCosts) > 0 && (
          <span className="text-sm text-muted-foreground">Outras despesas: {formatBRL(entry.otherCosts)}</span>
        )}
        <span className="text-sm text-muted-foreground">
          Rateio: {entry.allocationMethod === 'BY_VALUE' ? 'por valor dos itens' : 'por quantidade'}
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Itens</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Quantidade</TableHead>
                <TableHead>Custo unitário</TableHead>
                <TableHead>Custo efetivo (com rateio)</TableHead>
                <TableHead>Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entry.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.sku}</TableCell>
                  <TableCell>{item.productName}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{formatBRL(item.unitCost)}</TableCell>
                  <TableCell>{item.effectiveUnitCost ? formatBRL(item.effectiveUnitCost) : '—'}</TableCell>
                  <TableCell>
                    {formatBRL(Number(item.effectiveUnitCost ?? item.unitCost) * item.quantity)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
