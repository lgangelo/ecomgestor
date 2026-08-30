'use client';

import * as React from 'react';
import { Receipt, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatBRL } from '@ecommerce-manager/shared';
import { formatDate } from '@/lib/format';
import { useExpenseCategories, useExpenses } from '@/hooks/use-finance';
import { ExpenseFormDialog } from './expense-form-dialog';
import { ExpenseEditDialog } from './expense-edit-dialog';
import { ExpenseCategoryManageDialog } from './expense-category-manage-dialog';
import { RecurringExpensesPanel } from './recurring-expenses-panel';
import { TaxConfigPanel } from './tax-config-panel';

function ExpensesList() {
  const [page, setPage] = React.useState(1);
  const [categoryId, setCategoryId] = React.useState<string | undefined>();
  const { data: categories } = useExpenseCategories();
  const { data, isLoading } = useExpenses({ page, pageSize: 20, categoryId });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <div className="flex gap-2">
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
            <ExpenseCategoryManageDialog />
          </div>
        </div>
        <ExpenseFormDialog
          trigger={
            <Button>
              <Plus className="h-4 w-4" />
              Nova despesa
            </Button>
          }
        />
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
              <TableHead>Competência</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Forma de pagamento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell>{formatDate(expense.date)}</TableCell>
                <TableCell>{formatDate(expense.competenceDate)}</TableCell>
                <TableCell>
                  {expense.description}
                  {expense.isRecurring && (
                    <Badge tone="info" className="ml-2">
                      Recorrente
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{expense.categoryName}</TableCell>
                <TableCell>{expense.paymentMethod ?? '—'}</TableCell>
                <TableCell>{expense.status}</TableCell>
                <TableCell>{formatBRL(expense.amount)}</TableCell>
                <TableCell className="text-right">
                  <ExpenseEditDialog
                    expense={expense}
                    trigger={
                      <Button variant="ghost" size="sm">
                        <Pencil className="h-4 w-4" />
                        Editar
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

export function ExpensesView() {
  return (
    <div>
      <PageHeader title="Despesas" description="Custos operacionais fora do CMV." />

      <Tabs defaultValue="lancamentos">
        <TabsList>
          <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
          <TabsTrigger value="recorrentes">Recorrentes</TabsTrigger>
          <TabsTrigger value="impostos">Impostos estimados</TabsTrigger>
        </TabsList>
        <TabsContent value="lancamentos">
          <ExpensesList />
        </TabsContent>
        <TabsContent value="recorrentes">
          <RecurringExpensesPanel />
        </TabsContent>
        <TabsContent value="impostos">
          <TaxConfigPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
