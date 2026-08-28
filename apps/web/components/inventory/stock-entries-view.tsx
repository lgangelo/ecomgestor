'use client';

import * as React from 'react';
import Link from 'next/link';
import { PackagePlus, Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { STOCK_ENTRY_STATUS_PRESENTATION } from '@ecommerce-manager/ui';
import { formatDate } from '@/lib/format';
import { useStockEntries } from '@/hooks/use-stock-entries';
import { StockEntryFormDialog } from './stock-entry-form-dialog';

export function StockEntriesView() {
  const [page, setPage] = React.useState(1);
  const { data, isLoading } = useStockEntries({ page, pageSize: 20 });

  return (
    <div>
      <PageHeader
        title="Entradas de estoque"
        description="Recebimentos de fornecedores."
        actions={
          <StockEntryFormDialog
            trigger={
              <Button>
                <Plus className="h-4 w-4" />
                Nova entrada
              </Button>
            }
          />
        }
      />

      {isLoading || !data ? (
        <div className="rounded-lg border border-border">
          <TableSkeleton />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState icon={PackagePlus} title="Nenhuma entrada de estoque registrada" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Nota fiscal</TableHead>
              <TableHead>Itens</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>
                  <Link href={`/produtos/entradas/${entry.id}`} className="font-medium hover:underline">
                    {formatDate(entry.entryDate)}
                  </Link>
                </TableCell>
                <TableCell>{entry.supplierName ?? '—'}</TableCell>
                <TableCell>{entry.invoiceNumber ?? '—'}</TableCell>
                <TableCell>{entry.itemCount}</TableCell>
                <TableCell>
                  <StatusBadge status={entry.status} map={STOCK_ENTRY_STATUS_PRESENTATION} />
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
