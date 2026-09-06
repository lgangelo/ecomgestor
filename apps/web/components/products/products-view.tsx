'use client';

import * as React from 'react';
import Link from 'next/link';
import { ImageOff, Package, Plus, Search } from 'lucide-react';
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
import { resolveProductImageUrl, useProducts, useBulkUpdateProductStatus, type ProductListItem } from '@/hooks/use-products';
import { useCategories } from '@/hooks/use-categories';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { buildQueryString } from '@/lib/query-string';
import { ProductFormDialog } from './product-form-dialog';
import { ProductBulkDeleteDialog } from './product-bulk-delete-dialog';
import { ProductPhotoLightbox } from './product-photo-lightbox';

// Filtros e paginação persistem na URL (seção 57 da Fase 4).
const DEFAULT_FILTERS = { page: 1, search: '', categoryId: '', status: '', hasStock: true };

/** ACHADO REAL (relatado como "some a foto no mobile ao trocar de página/filtro"): os dados
 * sempre tinham `imageUrl` cadastrado — o problema real é a foto falhando ao CARREGAR no
 * celular (rede instável trocando de wifi/dados), e com `alt=""` o navegador não mostra nada
 * quando isso acontece — a coluna parecia ter sumido. Agora, se a foto falhar ao carregar,
 * mostra o mesmo indicador visível (borda + ícone) usado quando não há foto cadastrada — nunca
 * um espaço em branco silencioso. */
function ProductThumbnail({
  imageUrl,
  productName,
  onClick,
}: {
  imageUrl: string | null;
  productName: string;
  onClick: () => void;
}) {
  const [failed, setFailed] = React.useState(false);

  if (!imageUrl || failed) {
    return (
      <div className="flex h-14 w-14 items-center justify-center rounded border border-border bg-muted">
        <ImageOff className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  return (
    <button type="button" onClick={onClick} aria-label={`Ver fotos de ${productName}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- URL remota do canal externo, ou enviada por upload e servida pela nossa própria API */}
      <img
        src={resolveProductImageUrl(imageUrl)}
        alt=""
        onError={() => setFailed(true)}
        // ACHADO REAL (relatado como "foto aparece cortada/retangular com o filtro 'Só com
        // estoque' marcado"): o reset padrão do Tailwind aplica `max-width: 100%` em toda
        // `<img>` — quando a coluna da tabela fica mais estreita que 56px (outras colunas
        // mudando de largura conforme os resultados do filtro), isso espreme só a LARGURA da
        // miniatura, já que a altura fixa (`h-14`) não é afetada — resultado: imagem cortada nas
        // laterais em vez de quadrada. `max-w-none` garante o tamanho fixo sempre, nunca deixa a
        // coluna espremer a miniatura.
        className="h-14 w-14 max-w-none shrink-0 rounded object-cover transition-opacity hover:opacity-80"
      />
    </button>
  );
}

export function ProductsView() {
  const [filters, setFilters] = useUrlFilters(DEFAULT_FILTERS);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [selectingAll, setSelectingAll] = React.useState(false);
  const [lightboxProductId, setLightboxProductId] = React.useState<string | null>(null);

  // Campo de busca sempre responde na hora ao digitar (estado local); só o filtro de verdade
  // (URL + busca) atualiza com atraso — sem isso, CADA caractere disparava um `router.replace`
  // (navegação) mais uma busca na API, deixando a digitação visivelmente lenta.
  const [searchInput, setSearchInput] = React.useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  React.useEffect(() => {
    if (debouncedSearch !== filters.search) setFilters({ search: debouncedSearch, page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const { data: categories } = useCategories();
  const bulkUpdateStatus = useBulkUpdateProductStatus();
  const { data, isLoading } = useProducts({
    page: filters.page,
    pageSize: 20,
    search: filters.search || undefined,
    categoryId: filters.categoryId || undefined,
    status: filters.status || undefined,
    hasStock: filters.hasStock || undefined,
  });

  React.useEffect(() => {
    // Muda de página/filtro — a seleção desta página específica não faz mais sentido.
    setSelected(new Set());
  }, [filters.page, filters.search, filters.categoryId, filters.status, filters.hasStock]);

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
      // A API limita pageSize a 100 (ver PaginationQueryDto) — pedir `pageSize: data.total`
      // direto falhava a validação em silêncio sempre que havia mais de 100 produtos, então
      // aqui percorremos página por página até cobrir o total.
      const ids: string[] = [];
      const pageSize = 100;
      for (let page = 1; ids.length < data.total; page++) {
        const query = buildQueryString({
          page,
          pageSize,
          search: filters.search || undefined,
          categoryId: filters.categoryId || undefined,
          status: filters.status || undefined,
        });
        const result = await apiFetch<Paginated<ProductListItem>>(`/products${query}`);
        ids.push(...result.items.map((p) => p.id));
        if (result.items.length === 0 || page >= result.totalPages) break;
      }
      setSelected(new Set(ids));
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
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
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
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={filters.hasStock}
            // Sempre um boolean explícito (nunca `undefined`) — com o padrão sendo `true` agora,
            // desmarcar precisa gravar `false` de verdade na URL, senão cair pro padrão faz o
            // checkbox "voltar sozinho" a marcado.
            onCheckedChange={(checked) => setFilters({ hasStock: checked === true, page: 1 })}
          />
          Só com estoque
        </label>
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
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkUpdateStatus.isPending}
                  onClick={() => bulkUpdateStatus.mutate({ ids: [...selected], status: 'ACTIVE' })}
                >
                  Ativar {selected.size} selecionado(s)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkUpdateStatus.isPending}
                  onClick={() => bulkUpdateStatus.mutate({ ids: [...selected], status: 'INACTIVE' })}
                >
                  Desativar {selected.size} selecionado(s)
                </Button>
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
                <TableHead className="w-16" />
                <TableHead className="max-w-xs">Produto</TableHead>
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
                  <TableCell>
                    <ProductThumbnail
                      imageUrl={product.imageUrl}
                      productName={product.name}
                      onClick={() => setLightboxProductId(product.id)}
                    />
                  </TableCell>
                  <TableCell className="max-w-xs cursor-pointer">
                    <Link href={`/produtos/${product.id}`} className="hover:underline">
                      <p className="line-clamp-2 font-medium">{product.name}</p>
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

      <ProductPhotoLightbox
        productId={lightboxProductId}
        open={lightboxProductId !== null}
        onOpenChange={(open) => !open && setLightboxProductId(null)}
      />
    </div>
  );
}
