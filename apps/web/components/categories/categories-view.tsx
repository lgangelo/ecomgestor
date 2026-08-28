'use client';

import { FolderTree, Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCategories } from '@/hooks/use-categories';
import { CategoryFormDialog } from './category-form-dialog';

export function CategoriesView() {
  const { data, isLoading } = useCategories();

  return (
    <div>
      <PageHeader
        title="Categorias"
        description="Organize os produtos em categorias."
        actions={
          <CategoryFormDialog
            trigger={
              <Button>
                <Plus className="h-4 w-4" />
                Nova categoria
              </Button>
            }
          />
        }
      />

      {isLoading || !data ? (
        <div className="rounded-lg border border-border">
          <TableSkeleton columns={3} />
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={FolderTree} title="Nenhuma categoria cadastrada" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Categoria pai</TableHead>
              <TableHead>Produtos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((category) => (
              <TableRow key={category.id}>
                <TableCell className="font-medium">{category.name}</TableCell>
                <TableCell>{data.find((c) => c.id === category.parentId)?.name ?? '—'}</TableCell>
                <TableCell>{category.productCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
