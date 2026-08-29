'use client';

import Link from 'next/link';
import { Package, Plus, Search } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { PRODUCT_STATUS_PRESENTATION } from '@ecommerce-manager/ui';
import { formatBRL } from '@ecommerce-manager/shared';
import { useProducts } from '@/hooks/use-products';
import { useCategories } from '@/hooks/use-categories';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { ProductFormDialog } from './product-form-dialog';

// Filtros e paginação persistem na URL (seção 57 da Fase 4).
const DEFAULT_FILTERS = { page: 1, search: '', categoryId: '', status: '' };

export function ProductsView() {
  const [filters, setFilters] = useUrlFilters(DEFAULT_FILTERS);

  const { data: categories } = useCategories();
  const { data, isLoading } = useProducts({
    page: filters.page,
    pageSize: 20,
    search: filters.search || undefined,
    categoryId: filters.categoryId || undefined,
    status: filters.status || undefined,
  });

  return (
    <div>
      <PageHeader
        title="Produtos"
        description="Catálogo de produtos e variações (SKUs)."
        actions={
          <ProductFormDialog
            trigger={
              <Button>
                <Plus className="h-4 w-4" />
                Novo produto
              </Button>
            }
          />
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou SKU..."
            className="pl-8"
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value, page: 1 })}
          />
        </div>
        <Select
          value={filters.categoryId || 'all'}
          onValueChange={(v) => setFilters({ categoryId: v === 'all' ? undefined : v, page: 1 })}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Categoria" />
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
        <Select
          value={filters.status || 'all'}
          onValueChange={(v) => setFilters({ status: v === 'all' ? undefined : v, page: 1 })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="ACTIVE">Ativo</SelectItem>
            <SelectItem value="INACTIVE">Inativo</SelectItem>
            <SelectItem value="DRAFT">Rascunho</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading || !data ? (
        <div className="rounded-lg border border-border">
          <TableSkeleton />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nenhum produto encontrado"
          description="Ajuste os filtros ou cadastre um novo produto."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Marca</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead>Estoque</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((product) => (
              <TableRow key={product.id} className="cursor-pointer">
                <TableCell>
                  <Link href={`/produtos/${product.id}`} className="hover:underline">
                    <p className="font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {product.baseSku} · {product.variantCount} variação(ões)
                    </p>
                  </Link>
                </TableCell>
                <TableCell>{product.categoryName ?? '—'}</TableCell>
                <TableCell>{product.brand ?? '—'}</TableCell>
                <TableCell>
                  {product.minPrice !== null
                    ? product.minPrice === product.maxPrice
                      ? formatBRL(product.minPrice)
                      : `${formatBRL(product.minPrice)} – ${formatBRL(product.maxPrice ?? product.minPrice)}`
                    : '—'}
                </TableCell>
                <TableCell>{product.totalAvailable}</TableCell>
                <TableCell>
                  <StatusBadge status={product.status} map={PRODUCT_STATUS_PRESENTATION} />
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
