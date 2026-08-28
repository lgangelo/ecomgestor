'use client';

import * as React from 'react';
import { ListTree } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { INVENTORY_MOVEMENT_PRESENTATION } from '@ecommerce-manager/ui';
import { formatDate } from '@/lib/format';
import { useInventoryMovements } from '@/hooks/use-inventory';

const MOVEMENT_TYPES = [
  'PURCHASE',
  'SALE',
  'RETURN',
  'CANCELLATION',
  'ADJUSTMENT',
  'DAMAGE',
  'LOSS',
  'RESERVATION',
  'RELEASE',
];

export function MovementsView() {
  const [page, setPage] = React.useState(1);
  const [type, setType] = React.useState<string | undefined>();
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');

  const { data, isLoading } = useInventoryMovements({ page, pageSize: 30, type, dateFrom, dateTo });

  return (
    <div>
      <PageHeader title="Movimentações" description="Ledger completo de entradas e saídas de estoque." />

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select
            value={type ?? 'all'}
            onValueChange={(v) => {
              setType(v === 'all' ? undefined : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Todos os tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {MOVEMENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {INVENTORY_MOVEMENT_PRESENTATION[t]?.label ?? t}
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
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dateTo">Até</Label>
          <Input
            id="dateTo"
            type="date"
            className="w-40"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {isLoading || !data ? (
        <div className="rounded-lg border border-border">
          <TableSkeleton />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState icon={ListTree} title="Nenhuma movimentação encontrada" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Quantidade</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Referência</TableHead>
              <TableHead>Observação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((movement) => (
              <TableRow key={movement.id}>
                <TableCell>{formatDate(movement.createdAt, true)}</TableCell>
                <TableCell className="font-medium">{movement.productName}</TableCell>
                <TableCell>{movement.sku}</TableCell>
                <TableCell>
                  <StatusBadge status={movement.type} map={INVENTORY_MOVEMENT_PRESENTATION} />
                </TableCell>
                <TableCell className={movement.quantity < 0 ? 'text-destructive' : 'text-success'}>
                  {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}
                </TableCell>
                <TableCell className="max-w-xs truncate">{movement.reason ?? '—'}</TableCell>
                <TableCell>
                  {movement.referenceType ? `${movement.referenceType} · ${movement.referenceId?.slice(0, 8) ?? ''}` : '—'}
                </TableCell>
                <TableCell className="max-w-xs truncate">{movement.note ?? '—'}</TableCell>
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
