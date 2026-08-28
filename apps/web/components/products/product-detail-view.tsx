'use client';

import Link from 'next/link';
import { ArrowLeft, History, Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { PRODUCT_STATUS_PRESENTATION, VARIANT_STATUS_PRESENTATION } from '@ecommerce-manager/ui';
import { formatBRL } from '@ecommerce-manager/shared';
import { useProduct } from '@/hooks/use-products';
import { VariantFormDialog } from './variant-form-dialog';
import { CostHistoryDialog } from './cost-history-dialog';

export function ProductDetailView({ productId }: { productId: string }) {
  const { data: product, isLoading } = useProduct(productId);

  if (isLoading || !product) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div>
      <Link href="/produtos" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar para produtos
      </Link>

      <PageHeader
        title={product.name}
        description={`SKU base: ${product.baseSku}${product.category ? ` · Categoria: ${product.category.name}` : ''}`}
        actions={
          <VariantFormDialog
            productId={productId}
            trigger={
              <Button>
                <Plus className="h-4 w-4" />
                Nova variação
              </Button>
            }
          />
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <StatusBadge status={product.status} map={PRODUCT_STATUS_PRESENTATION} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Marca</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm font-medium">{product.brand ?? '—'}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Variações</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm font-medium">{product.variants.length}</CardContent>
        </Card>
      </div>

      {product.description && (
        <Card className="mb-6">
          <CardContent className="p-6 text-sm text-muted-foreground">{product.description}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Variações (SKUs)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Cor / Tamanho</TableHead>
                <TableHead>Preço sugerido</TableHead>
                <TableHead>Custo atual</TableHead>
                <TableHead>Disponível</TableHead>
                <TableHead>Reservado</TableHead>
                <TableHead>Mín.</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {product.variants.map((variant) => (
                <TableRow key={variant.id}>
                  <TableCell className="font-medium">{variant.sku}</TableCell>
                  <TableCell>
                    {[variant.color, variant.size].filter(Boolean).join(' / ') || '—'}
                  </TableCell>
                  <TableCell>{formatBRL(variant.suggestedPrice)}</TableCell>
                  <TableCell>{variant.latestCost ? formatBRL(variant.latestCost) : '—'}</TableCell>
                  <TableCell>{variant.inventory.available}</TableCell>
                  <TableCell>{variant.inventory.reserved}</TableCell>
                  <TableCell>{variant.minStock}</TableCell>
                  <TableCell>
                    <StatusBadge status={variant.status} map={VARIANT_STATUS_PRESENTATION} />
                  </TableCell>
                  <TableCell>
                    <CostHistoryDialog
                      productId={productId}
                      variantId={variant.id}
                      sku={variant.sku}
                      trigger={
                        <Button variant="ghost" size="sm">
                          <History className="h-4 w-4" />
                          Custos
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
