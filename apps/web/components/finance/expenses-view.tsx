'use client';

import * as React from 'react';
import { Receipt, Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatBRL } from '@ecommerce-manager/shared';
import { formatDate } from '@/lib/format';
import { useExpenseCategories, useExpenses } from '@/hooks/use-finance';
import { ExpenseFormDialog } from './expense-form-dialog';

export function ExpensesView() {
  const [page, setPage] = React.useState(1);
  const [categoryId, setCategoryId] = React.useState<string | undefined>();
  const { data: categories } = useExpenseCategories();
  const { data, isLoading } = useExpenses({ page, pageSize: 20, categoryId });

  return (
    <div>
      <PageHeader
        title="Despesas"
        description="Custos operacionais fora do CMV."
        actions={
          <ExpenseFormDialog
            trigger={
              <Button>
                <Plus className="h-4 w-4" />
                Nova despesa
              </Button>
            }
          />
        }
      />

      <div className="mb-4 space-y-1.5">
        <Label>Categoria</Label>
        <Select
          value={categoryId ?? 'all'}
          onValueChange={(v) => {
            setCategoryId(v === 'all' ? undefined : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Todas as categorias" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories?.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading || !data ? (
        <div className="rounded-lg border border-border">
          <TableSkeleton />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState icon={Receipt} title="Nenhuma despesa registrada" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Forma de pagamento</TableHead>
              <TableHead>Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell>{formatDate(expense.date)}</TableCell>
                <TableCell>{expense.categoryName}</TableCell>
                <TableCell>{expense.description}</TableCell>
                <TableCell>{expense.paymentMethod ?? '—'}</TableCell>
                <TableCell>{formatBRL(expense.amount)}</TableCell>
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
