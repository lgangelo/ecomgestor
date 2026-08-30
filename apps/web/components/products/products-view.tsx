'use client';

import * as React from 'react';
import Link from 'next/link';
import { Package, Plus, Search } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { PRODUCT_STATUS_PRESENTATION } from '@ecommerce-manager/ui';
import { formatBRL } from '@ecommerce-manager/shared';
import { apiFetch } from '@/lib/api-client';
import type { Paginated } from '@/lib/types/pagination';
import { useProducts, type ProductListItem } from '@/hooks/use-products';
import { useCategories } from '@/hooks/use-categories';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { buildQueryString } from '@/lib/query-string';
import { ProductFormDialog } from './product-form-dialog';
import { ProductBulkDeleteDialog } from './product-bulk-delete-dialog';

// Filtros e paginação persistem na URL (seção 57 da Fase 4).
const DEFAULT_FILTERS = { page: 1, search: '', categoryId: '', status: '' };

export function ProductsView() {
  const [filters, setFilters] = useUrlFilters(DEFAULT_FILTERS);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [selectingAll, setSelectingAll] = React.useState(false);

  const { data: categories } = useCategories();
  const { data, isLoading } = useProducts({
    page: filters.page,
    pageSize: 20,
    search: filters.search || undefined,
    categoryId: filters.categoryId || undefined,
    status: filters.status || undefined,
  });

  React.useEffect(() => {
    // Muda de página/filtro — a seleção desta página específica não faz mais sentido.
    setSelected(new Set());
  }, [filters.page, filters.search, filters.categoryId, filters.status]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    if (!data) return;
    const pageIds = data.items.map((p) => p.id);
    const allSelected = pageIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function selectAllMatching() {
    if (!data || data.total === 0) return;
    setSelectingAll(true);
    try {
      const query = buildQueryString({
        page: 1,
        pageSize: data.total,
        search: filters.search || undefined,
        categoryId: filters.categoryId || undefined,
        status: filters.status || undefined,
      });
      const all = await apiFetch<Paginated<ProductListItem>>(`/products${query}`);
      setSelected(new Set(all.items.map((p) => p.id)));
    } finally {
      setSelectingAll(false);
    }
  }

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
        <>
          {selected.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <span>{selected.size} selecionado(s)</span>
              <div className="flex items-center gap-2">
                {selected.size < data.total && (
                  <Button size="sm" variant="outline" disabled={selectingAll} onClick={selectAllMatching}>
                    {selectingAll ? 'Carregando...' : `Selecionar todos os ${data.total}`}
                  </Button>
                )}
                <ProductBulkDeleteDialog
                  ids={[...selected]}
                  onDeleted={() => setSelected(new Set())}
                  trigger={
                    <Button size="sm" variant="destructive">
                      Excluir {selected.size} selecionado(s)
                    </Button>
                  }
                />
              </div>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={data.items.every((p) => selected.has(p.id))}
                    onCheckedChange={togglePage}
                    aria-label="Selecionar página"
                  />
                </TableHead>
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
                <TableRow key={product.id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(product.id)}
                      onCheckedChange={() => toggleOne(product.id)}
                      aria-label={`Selecionar ${product.name}`}
                    />
                  </TableCell>
                  <TableCell className="cursor-pointer">
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
        </>
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
