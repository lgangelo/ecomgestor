'use client';

import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { ORDER_STATUS_PRESENTATION } from '@ecommerce-manager/ui';
import { formatBRL } from '@ecommerce-manager/shared';
import { formatDate } from '@/lib/format';
import { useOrders } from '@/hooks/use-orders';
import { useChannels } from '@/hooks/use-channels';
import { useUrlFilters } from '@/hooks/use-url-filters';

const ORDER_STATUSES = Object.keys(ORDER_STATUS_PRESENTATION);

const SYNC_STATUS_LABELS: Record<string, string> = {
  OK: 'Sincronizado',
  REQUIRES_MAPPING: 'Precisa de vínculo',
  ERROR: 'Erro de sincronização',
};

// Filtros e paginação persistem na URL (seção 57 da Fase 4) — atualizar a página ou compartilhar
// o link preserva o que foi filtrado.
const DEFAULT_FILTERS = {
  page: 1,
  customerName: '',
  channelId: '',
  status: '',
  syncStatus: '',
  dateFrom: '',
  dateTo: '',
};

export function OrdersView() {
  const [filters, setFilters] = useUrlFilters(DEFAULT_FILTERS);

  const { data: channels } = useChannels();
  const { data, isLoading } = useOrders({
    page: filters.page,
    pageSize: 20,
    customerName: filters.customerName || undefined,
    channelId: filters.channelId || undefined,
    status: filters.status || undefined,
    syncStatus: filters.syncStatus || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
  });

  return (
    <div>
      <PageHeader title="Pedidos" description="Todos os pedidos, de todos os canais." />

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="customerName">Cliente</Label>
          <Input
            id="customerName"
            className="w-48"
            value={filters.customerName}
            onChange={(e) => setFilters({ customerName: e.target.value, page: 1 })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Canal</Label>
          <Select
            value={filters.channelId || 'all'}
            onValueChange={(v) => setFilters({ channelId: v === 'all' ? undefined : v, page: 1 })}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os canais</SelectItem>
              {channels?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select
            value={filters.status || 'all'}
            onValueChange={(v) => setFilters({ status: v === 'all' ? undefined : v, page: 1 })}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {ORDER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {ORDER_STATUS_PRESENTATION[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Sincronização</Label>
          <Select
            value={filters.syncStatus || 'all'}
            onValueChange={(v) => setFilters({ syncStatus: v === 'all' ? undefined : v, page: 1 })}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {Object.entries(SYNC_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dateFrom">De</Label>
          <Input
            id="dateFrom"
            type="date"
            className="w-40"
            value={filters.dateFrom}
            onChange={(e) => setFilters({ dateFrom: e.target.value, page: 1 })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dateTo">Até</Label>
          <Input
            id="dateTo"
            type="date"
            className="w-40"
            value={filters.dateTo}
            onChange={(e) => setFilters({ dateTo: e.target.value, page: 1 })}
          />
        </div>
      </div>

      {isLoading || !data ? (
        <div className="rounded-lg border border-border">
          <TableSkeleton />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState icon={ShoppingBag} title="Nenhum pedido encontrado" description="Ajuste os filtros aplicados." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
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
                <TableCell>{order.channelName}</TableCell>
                <TableCell>{order.customerName ?? '—'}</TableCell>
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
        <PaginationBar
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          onPageChange={(page) => setFilters({ page })}
        />
      )}
    </div>
  );
}
