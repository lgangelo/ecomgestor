'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { FISCAL_DOCUMENT_STATUS_PRESENTATION, ORDER_STATUS_PRESENTATION } from '@ecommerce-manager/ui';
import { formatBRL } from '@ecommerce-manager/shared';
import { formatDate } from '@/lib/format';
import { useOrder } from '@/hooks/use-orders';
import { UpdateStatusDialog } from './update-status-dialog';
import { RegisterReturnDialog } from './register-return-dialog';

export function OrderDetailView({ orderId }: { orderId: string }) {
  const { data: order, isLoading } = useOrder(orderId);

  if (isLoading || !order) {
    return <Skeleton className="h-96" />;
  }

  return (
    <div>
      <Link
        href="/vendas/pedidos"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para pedidos
      </Link>

      <PageHeader
        title={`Pedido ${order.externalOrderId ?? order.id.slice(0, 8)}`}
        description={`${order.channel.name} · ${formatDate(order.orderDate, true)}`}
        actions={
          <div className="flex gap-2">
            <RegisterReturnDialog
              orderId={orderId}
              items={order.items}
              trigger={<Button variant="outline">Registrar devolução</Button>}
            />
            <UpdateStatusDialog orderId={orderId} trigger={<Button>Atualizar status</Button>} />
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <StatusBadge status={order.status} map={ORDER_STATUS_PRESENTATION} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Total</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-lg font-semibold">{formatBRL(order.total)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>CMV</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-lg font-semibold">{formatBRL(order.cmv)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Lucro estimado</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-lg font-semibold">{formatBRL(order.estimatedProfit)}</p>
            <p className="text-xs text-muted-foreground">Margem: {order.marginPercent.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Itens</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Qtd.</TableHead>
                    <TableHead>Preço</TableHead>
                    <TableHead>Desconto</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <p className="font-medium">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">{item.sku}</p>
                      </TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{formatBRL(item.unitPrice)}</TableCell>
                      <TableCell>{formatBRL(item.discount)}</TableCell>
                      <TableCell>{formatBRL(item.lineTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documentos fiscais</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {order.fiscalDocuments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum documento fiscal emitido para este pedido.</p>
              ) : (
                <div className="space-y-2">
                  {order.fiscalDocuments.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between text-sm">
                      <span>
                        {doc.type} {doc.number ? `— NF-e ${doc.number}` : ''}
                      </span>
                      <StatusBadge status={doc.status} map={FISCAL_DOCUMENT_STATUS_PRESENTATION} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {order.statusHistory.map((h) => (
                <div key={h.id} className="text-sm">
                  <div className="flex items-center justify-between">
                    <StatusBadge status={h.status} map={ORDER_STATUS_PRESENTATION} />
                    <span className="text-xs text-muted-foreground">{formatDate(h.changedAt, true)}</span>
                  </div>
                  {h.note && <p className="mt-1 text-xs text-muted-foreground">{h.note}</p>}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pagamentos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {order.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
              ) : (
                order.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span>{p.method}</span>
                    <span className="font-medium">{formatBRL(p.amount)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
