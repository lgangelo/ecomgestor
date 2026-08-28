'use client';

import * as React from 'react';
import Link from 'next/link';
import { Undo2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { RETURN_STATUS_PRESENTATION } from '@ecommerce-manager/ui';
import { formatDate } from '@/lib/format';
import { useReturns } from '@/hooks/use-returns';
import { RegisterRefundDialog } from './register-refund-dialog';

export function ReturnsView() {
  const [page, setPage] = React.useState(1);
  const { data, isLoading } = useReturns({ page, pageSize: 20 });

  return (
    <div>
      <PageHeader title="Devoluções" description="Devoluções solicitadas pelos clientes." />

      {isLoading || !data ? (
        <div className="rounded-lg border border-border">
          <TableSkeleton />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState icon={Undo2} title="Nenhuma devolução registrada" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Solicitada em</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((ret) => (
              <TableRow key={ret.id}>
                <TableCell>{formatDate(ret.requestedAt)}</TableCell>
                <TableCell>
                  <Link href={`/vendas/pedidos/${ret.orderId}`} className="font-medium hover:underline">
                    {ret.orderId.slice(0, 8)}
                  </Link>
                </TableCell>
                <TableCell>{ret.channelName}</TableCell>
                <TableCell>{ret.customerName ?? '—'}</TableCell>
                <TableCell className="max-w-xs truncate">{ret.reason ?? '—'}</TableCell>
                <TableCell>
                  <StatusBadge status={ret.status} map={RETURN_STATUS_PRESENTATION} />
                </TableCell>
                <TableCell>
                  <RegisterRefundDialog
                    returnId={ret.id}
                    trigger={
                      <Button variant="ghost" size="sm">
                        Reembolso
                      </Button>
                    }
                  />
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
