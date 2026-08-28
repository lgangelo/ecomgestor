'use client';

import * as React from 'react';
import { DollarSign, Percent, ShoppingBag, TrendingDown } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { ORDER_STATUS_PRESENTATION } from '@ecommerce-manager/ui';
import { formatBRL } from '@ecommerce-manager/shared';
import { formatDate } from '@/lib/format';
import { useOrders } from '@/hooks/use-orders';
import { useFinanceOverview } from '@/hooks/use-finance';
import { FinancePeriodFilter, defaultMonthRange } from './finance-period-filter';

export function RevenuesView() {
  const [range, setRange] = React.useState(defaultMonthRange);
  const [page, setPage] = React.useState(1);

  const { data: overview, isLoading: overviewLoading } = useFinanceOverview(range);
  const { data, isLoading } = useOrders({ page, pageSize: 20, dateFrom: range.dateFrom, dateTo: range.dateTo });

  return (
    <div>
      <PageHeader title="Receitas" description="Receitas geradas pelos pedidos no período." />
      <FinancePeriodFilter value={range} onChange={setRange} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {overviewLoading || !overview ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <StatCard title="Receita bruta" value={formatBRL(overview.grossRevenue)} icon={DollarSign} />
            <StatCard title="Descontos" value={formatBRL(overview.discounts)} icon={TrendingDown} />
            <StatCard title="Receita líquida" value={formatBRL(overview.netRevenue)} icon={ShoppingBag} />
            <StatCard
              title="Margem bruta"
              value={overview.netRevenue > 0 ? `${((overview.grossProfit / overview.netRevenue) * 100).toFixed(1)}%` : '—'}
              icon={Percent}
            />
          </>
        )}
      </div>

      {isLoading || !data ? (
        <div className="rounded-lg border border-border">
          <TableSkeleton />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState icon={ShoppingBag} title="Nenhuma receita no período" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((order) => (
              <TableRow key={order.id}>
                <TableCell>{formatDate(order.orderDate)}</TableCell>
                <TableCell>{order.externalOrderId ?? order.id.slice(0, 8)}</TableCell>
                <TableCell>{order.channelName}</TableCell>
                <TableCell>{formatBRL(order.total)}</TableCell>
                <TableCell>
                  <StatusBadge status={order.status} map={ORDER_STATUS_PRESENTATION} />
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
