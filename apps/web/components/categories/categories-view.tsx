'use client';

import { FolderTree, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCategories } from '@/hooks/use-categories';
import { CategoryFormDialog } from './category-form-dialog';
import { CategoryEditDialog } from './category-edit-dialog';
import { CategoryDeleteDialog } from './category-delete-dialog';

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
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((category) => (
              <TableRow key={category.id}>
                <TableCell className="font-medium">{category.name}</TableCell>
                <TableCell>{data.find((c) => c.id === category.parentId)?.name ?? '—'}</TableCell>
                <TableCell>{category.productCount}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <CategoryEditDialog
                      category={category}
                      trigger={
                        <Button variant="ghost" size="sm">
                          <Pencil className="h-4 w-4" />
                          Editar
                        </Button>
                      }
                    />
                    <CategoryDeleteDialog
                      categoryId={category.id}
                      categoryName={category.name}
                      trigger={
                        <Button variant="ghost" size="sm">
                          <Trash2 className="h-4 w-4" />
                          Excluir
                        </Button>
                      }
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
