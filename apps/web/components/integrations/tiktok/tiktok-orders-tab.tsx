'use client';

import * as React from 'react';
import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { ORDER_STATUS_PRESENTATION } from '@ecommerce-manager/ui';
import { formatBRL } from '@ecommerce-manager/shared';
import { formatDate } from '@/lib/format';
import { useOrders } from '@/hooks/use-orders';
import { useReprocessTikTokOrder } from '@/hooks/use-tiktok';

export function TikTokOrdersTab({ channelId }: { channelId?: string | null }) {
  const [page, setPage] = React.useState(1);
  const { data, isLoading } = useOrders({ page, pageSize: 20, channelId: channelId ?? undefined });
  const reprocess = useReprocessTikTokOrder();

  if (!channelId) {
    return <EmptyState icon={ShoppingBag} title="Canal ainda não conectado" description="Conecte a loja para ver os pedidos importados." />;
  }

  return (
    <div>
      {isLoading || !data ? (
        <div className="rounded-lg border border-border">
          <TableSkeleton />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState icon={ShoppingBag} title="Nenhum pedido importado ainda" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sincronização</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((order) => (
              <TableRow key={order.id}>
                <TableCell>{formatDate(order.orderDate)}</TableCell>
                <TableCell>
                  <Link href={`/vendas/pedidos/${order.id}`} className="font-medium hover:underline">
                    {order.externalOrderId ?? order.id.slice(0, 8)}
                  </Link>
                </TableCell>
                <TableCell>{order.customerName ?? '—'}</TableCell>
                <TableCell>{formatBRL(order.total)}</TableCell>
                <TableCell>
                  <StatusBadge status={order.status} map={ORDER_STATUS_PRESENTATION} />
                </TableCell>
                <TableCell>
                  {order.integrationSyncStatus === 'REQUIRES_MAPPING' ? (
                    <Badge tone="warning">SKU sem vínculo</Badge>
                  ) : order.integrationSyncStatus === 'ERROR' ? (
                    <Badge tone="danger">Erro</Badge>
                  ) : (
                    <Badge tone="success">OK</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {order.integrationSyncStatus === 'REQUIRES_MAPPING' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={reprocess.isPending}
                      onClick={() => reprocess.mutate(order.id)}
                    >
                      Reprocessar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {data && data.totalPages > 1 && (
        <PaginationBar page={data.page} totalPages={data.totalPages} total={data.total} onPageChange={setPage} />
      )}
    </div>
  );
}
