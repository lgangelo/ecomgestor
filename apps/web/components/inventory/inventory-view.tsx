'use client';

import * as React from 'react';
import { AlertTriangle, Boxes, Package, Plus, Search, Warehouse } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatBRL } from '@ecommerce-manager/shared';
import { useInventory, useInventorySummary } from '@/hooks/use-inventory';
import { MovementFormDialog } from './movement-form-dialog';
import { InventoryInsightsSection } from './inventory-insights';

export function InventoryView() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [belowMinimumOnly, setBelowMinimumOnly] = React.useState(false);

  const { data: summary, isLoading: summaryLoading } = useInventorySummary();
  const { data, isLoading } = useInventory({ page, pageSize: 20, search, belowMinimumOnly });

  return (
    <div>
      <PageHeader
        title="Estoque"
        description="Disponibilidade e reservas por SKU."
        actions={
          <MovementFormDialog
            trigger={
              <Button>
                <Plus className="h-4 w-4" />
                Novo ajuste
              </Button>
            }
          />
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryLoading || !summary ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <StatCard title="SKUs cadastrados" value={String(summary.totalSkus)} icon={Package} />
            <StatCard title="Total de unidades" value={String(summary.totalUnits)} icon={Boxes} />
            <StatCard title="Valor estimado em estoque" value={formatBRL(summary.estimatedValue)} icon={Warehouse} />
            <StatCard
              title="Produtos abaixo do mínimo"
              value={String(summary.belowMinimumCount)}
              icon={AlertTriangle}
            />
          </>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por SKU ou produto..."
            className="pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="belowMinimum"
            checked={belowMinimumOnly}
            onCheckedChange={(v) => {
              setBelowMinimumOnly(v);
              setPage(1);
            }}
          />
          <Label htmlFor="belowMinimum">Somente abaixo do mínimo</Label>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="rounded-lg border border-border">
          <TableSkeleton />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState icon={Warehouse} title="Nenhum item de estoque encontrado" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Estoque físico</TableHead>
              <TableHead>Disponível</TableHead>
              <TableHead>Reservado</TableHead>
              <TableHead>Estoque mínimo</TableHead>
              <TableHead>Valor estimado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((row) => (
              <TableRow key={row.variantId}>
                <TableCell className="font-medium">{row.productName}</TableCell>
                <TableCell>{row.sku}</TableCell>
                <TableCell>{row.onHand}</TableCell>
                <TableCell>
                  {row.available}
                  {row.belowMinimum && (
                    <Badge tone="warning" className="ml-2">
                      Abaixo do mínimo
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{row.reserved}</TableCell>
                <TableCell>{row.minStock}</TableCell>
                <TableCell>{formatBRL(row.estimatedValue)}</TableCell>
                <TableCell>
                  <MovementFormDialog
                    variantId={row.variantId}
                    sku={row.sku}
                    trigger={
                      <Button variant="ghost" size="sm">
                        Ajustar
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

      <div className="mt-8">
        <InventoryInsightsSection />
      </div>
    </div>
  );
}
