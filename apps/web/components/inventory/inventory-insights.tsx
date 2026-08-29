'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBRL } from '@ecommerce-manager/shared';
import { formatDate } from '@/lib/format';
import { useInventoryInsights } from '@/hooks/use-inventory';

/** Seções 33 e 36 da Fase 4 — estoque parado e sugestão de reposição, gerenciais e simples. */
export function InventoryInsightsSection() {
  const { data, isLoading } = useInventoryInsights();

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Estoque parado</CardTitle>
          <p className="text-xs text-muted-foreground">
            Estoque disponível sem venda há mais de {data.slowMovingDays} dias.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {data.slowMoving.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum produto parado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Estoque</TableHead>
                  <TableHead>Valor em estoque</TableHead>
                  <TableHead>Última venda</TableHead>
                  <TableHead>Dias sem venda</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.slowMoving.slice(0, 20).map((item) => (
                  <TableRow key={item.variantId}>
                    <TableCell className="font-medium">
                      {item.productName}
                      <span className="ml-1 text-xs text-muted-foreground">({item.sku})</span>
                    </TableCell>
                    <TableCell>{item.onHand}</TableCell>
                    <TableCell>{formatBRL(item.estimatedValue)}</TableCell>
                    <TableCell>{item.lastSaleAt ? formatDate(item.lastSaleAt) : 'Nunca vendido'}</TableCell>
                    <TableCell>{item.daysSinceLastSale ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reposição sugerida</CardTitle>
          <p className="text-xs text-muted-foreground">
            Disponível abaixo do mínimo ou com cobertura menor que {data.restockCoverageDays} dias.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {data.restockSuggestions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma reposição sugerida.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Disponível</TableHead>
                  <TableHead>Mínimo</TableHead>
                  <TableHead>Cobertura</TableHead>
                  <TableHead>Sugestão</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.restockSuggestions.slice(0, 20).map((item) => (
                  <TableRow key={item.variantId}>
                    <TableCell className="font-medium">
                      {item.productName}
                      <span className="ml-1 text-xs text-muted-foreground">({item.sku})</span>
                    </TableCell>
                    <TableCell>{item.available}</TableCell>
                    <TableCell>{item.minStock}</TableCell>
                    <TableCell>{item.coverageDays !== null ? `${item.coverageDays} dias` : 'Sem dados suficientes'}</TableCell>
                    <TableCell>
                      <Badge tone={item.reason === 'below_minimum' ? 'danger' : 'warning'}>
                        {item.reason === 'below_minimum' ? 'Abaixo do mínimo' : 'Cobertura baixa'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
