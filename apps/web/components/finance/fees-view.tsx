'use client';

import * as React from 'react';
import { Percent } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatBRL } from '@ecommerce-manager/shared';
import { formatDate } from '@/lib/format';
import { useFees } from '@/hooks/use-finance';
import { FinancePeriodFilter, defaultMonthRange } from './finance-period-filter';

export function FeesView() {
  const [range, setRange] = React.useState(defaultMonthRange);
  const [page, setPage] = React.useState(1);
  const { data, isLoading } = useFees({ page, pageSize: 20, ...range });

  return (
    <div>
      <PageHeader title="Taxas" description="Taxas de marketplace cobradas por pedido." />
      <FinancePeriodFilter value={range} onChange={setRange} />

      {isLoading || !data ? (
        <div className="rounded-lg border border-border">
          <TableSkeleton />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState icon={Percent} title="Nenhuma taxa registrada no período" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((fee) => (
              <TableRow key={fee.id}>
                <TableCell>{formatDate(fee.createdAt)}</TableCell>
                <TableCell>{fee.channelName}</TableCell>
                <TableCell>{fee.feeType}</TableCell>
                <TableCell>{formatBRL(fee.amount)}</TableCell>
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
