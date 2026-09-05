'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/use-toast';
import { PRODUCT_STATUS_PRESENTATION, VARIANT_STATUS_PRESENTATION, INVENTORY_MOVEMENT_PRESENTATION } from '@ecommerce-manager/ui';
import { formatBRL } from '@ecommerce-manager/shared';
import { formatDate, stripHtmlForPreview } from '@/lib/format';
import { apiFetch, ApiError } from '@/lib/api-client';
import {
  resolveProductImageUrl,
  useProduct,
  useProductChannels,
  useProductCostHistory,
  useProductMovements,
  useProductSummary,
  type ProductVariantDetail,
} from '@/hooks/use-products';
import { useOrders } from '@/hooks/use-orders';
import { useAuditLogs } from '@/hooks/use-audit';
import { StatCard } from '@/components/shared/stat-card';
import { VariantFormDialog } from './variant-form-dialog';
import { VariantEditDialog } from './variant-edit-dialog';
import { CostHistoryDialog } from './cost-history-dialog';
import { ProductCostDialog } from './product-cost-dialog';
import { ProductDeleteDialog } from './product-delete-dialog';
import { ProductEditDialog } from './product-edit-dialog';

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
        title={
          <div className="flex items-center gap-3">
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL remota do canal externo, ou enviada por upload e servida pela nossa própria API
              <img src={resolveProductImageUrl(product.imageUrl)} alt="" className="h-12 w-12 rounded object-cover" />
            ) : (
              <div className="h-12 w-12 rounded bg-muted" />
            )}
            {product.name}
          </div>
        }
        description={`SKU base: ${product.baseSku}${product.category ? ` · Categoria: ${product.category.name}` : ''}`}
        actions={
          <div className="flex gap-2">
            <ProductEditDialog
              product={product}
              trigger={
                <Button variant="outline">
                  <Pencil className="h-4 w-4" />
                  Editar produto
                </Button>
              }
            />
            <ProductCostDialog
              productId={productId}
              variantCount={product.variants.length}
              trigger={
                <Button variant="outline">
                  <Wallet className="h-4 w-4" />
                  Definir custo
                </Button>
              }
            />
            <VariantFormDialog
              productId={productId}
              trigger={
                <Button>
                  <Plus className="h-4 w-4" />
                  Nova variação
                </Button>
              }
            />
            <ProductDeleteDialog
              productId={productId}
              productName={product.name}
              trigger={
                <Button variant="destructive">
                  <Trash2 className="h-4 w-4" />
                  Excluir
                </Button>
              }
            />
          </div>
        }
      />

      <Tabs defaultValue="resumo">
        <TabsList>
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="estoque">Estoque</TabsTrigger>
          <TabsTrigger value="custos">Custos</TabsTrigger>
          <TabsTrigger value="medidas">Medidas</TabsTrigger>
          <TabsTrigger value="vendas">Vendas</TabsTrigger>
          <TabsTrigger value="canais">Canais</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo">
          <ResumoTab productId={productId} product={product} />
        </TabsContent>
        <TabsContent value="estoque">
          <EstoqueTab productId={productId} />
        </TabsContent>
        <TabsContent value="custos">
          <CustosTab productId={productId} />
        </TabsContent>
        <TabsContent value="medidas">
          <MedidasTab productId={productId} product={product} />
        </TabsContent>
        <TabsContent value="vendas">
          <VendasTab productId={productId} />
        </TabsContent>
        <TabsContent value="canais">
          <CanaisTab productId={productId} />
        </TabsContent>
        <TabsContent value="historico">
          <HistoricoTab productId={productId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ResumoTab({
  productId,
  product,
}: {
  productId: string;
  product: NonNullable<ReturnType<typeof useProduct>['data']>;
}) {
  const { data: summary } = useProductSummary(productId);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <StatusBadge status={product.status} map={PRODUCT_STATUS_PRESENTATION} />
          </CardContent>
        </Card>
        {summary && (
          <>
            <StatCard title="Disponível" value={String(summary.available)} />
            <StatCard title="Reservado" value={String(summary.reserved)} />
            <StatCard title="Custo atual (méd.)" value={summary.currentCost ? formatBRL(summary.currentCost) : '—'} />
            <StatCard
              title="Preço sugerido (méd.)"
              value={summary.suggestedPrice ? formatBRL(summary.suggestedPrice) : '—'}
            />
            <StatCard title="Unidades vendidas (30d)" value={String(summary.unitsSold30d)} />
            <StatCard title="Faturamento (30d)" value={formatBRL(summary.revenue30d)} />
            <StatCard title="Lucro estimado (30d)" value={formatBRL(summary.estimatedProfit30d)} />
            <StatCard title="Margem média (30d)" value={summary.avgMargin30d !== null ? `${summary.avgMargin30d.toFixed(1)}%` : '—'} />
          </>
        )}
      </div>

      {product.description && (
        <Card>
          <CardContent className="whitespace-pre-line p-6 text-sm text-muted-foreground">
            {stripHtmlForPreview(product.description)}
          </CardContent>
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
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {variant.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- URL remota do canal externo, ou enviada por upload e servida pela nossa própria API
                        <img src={resolveProductImageUrl(variant.imageUrl)} alt="" className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted" />
                      )}
                      {variant.sku}
                    </div>
                  </TableCell>
                  <TableCell>{[variant.color, variant.size].filter(Boolean).join(' / ') || '—'}</TableCell>
                  <TableCell>{formatBRL(variant.suggestedPrice)}</TableCell>
                  <TableCell>
                    <CostHistoryDialog
                      productId={productId}
                      variantId={variant.id}
                      sku={variant.sku}
                      trigger={
                        <Button variant="link" size="sm" className="h-auto p-0">
                          {variant.latestCost ? formatBRL(variant.latestCost) : 'Definir custo'}
                        </Button>
                      }
                    />
                  </TableCell>
                  <TableCell>{variant.inventory.available}</TableCell>
                  <TableCell>{variant.inventory.reserved}</TableCell>
                  <TableCell>{variant.minStock}</TableCell>
                  <TableCell>
                    <StatusBadge status={variant.status} map={VARIANT_STATUS_PRESENTATION} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <VariantEditDialog
                        productId={productId}
                        product={product}
                        variant={variant}
                        syncBaseSku={product.variants.length === 1}
                        trigger={
                          <Button variant="ghost" size="sm">
                            <Pencil className="h-4 w-4" />
                            Editar
                          </Button>
                        }
                      />
                    </div>
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

function EstoqueTab({ productId }: { productId: string }) {
  const { data: movements, isLoading } = useProductMovements(productId);

  if (isLoading || !movements) return <Skeleton className="h-48" />;
  if (movements.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma movimentação registrada.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>SKU</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Quantidade</TableHead>
          <TableHead>Motivo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {movements.map((m) => (
          <TableRow key={m.id}>
            <TableCell>{formatDate(m.createdAt, true)}</TableCell>
            <TableCell>{m.variant.sku}</TableCell>
            <TableCell>
              <StatusBadge status={m.type} map={INVENTORY_MOVEMENT_PRESENTATION} />
            </TableCell>
            <TableCell className={m.quantity < 0 ? 'text-destructive' : 'text-success'}>
              {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
            </TableCell>
            <TableCell className="max-w-xs truncate">{m.reason ?? m.note ?? '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CustosTab({ productId }: { productId: string }) {
  const { data: history, isLoading } = useProductCostHistory(productId);

  if (isLoading || !history) return <Skeleton className="h-48" />;
  if (history.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nenhum custo registrado ainda.</p>;
  }

  return (
    <div className="space-y-2">
      {history.map((h) => (
        <div key={h.id} className="flex items-center justify-between rounded-md border border-border px-4 py-2 text-sm">
          <span className="font-medium">{h.sku}</span>
          <span className="text-muted-foreground">{formatDate(h.effectiveDate)}</span>
          <span className="font-medium">{formatBRL(h.cost)}</span>
        </div>
      ))}
    </div>
  );
}

interface MeasurementDraft {
  weight: string;
  length: string;
  width: string;
  height: string;
}

/** Sem tamanho definido: as variações só diferem pela cor, então são fisicamente o mesmo produto
 * — todas caem num único grupo (1 linha só), em vez de uma linha por variação/cor. */
const NO_SIZE_GROUP_KEY = '__sem-tamanho__';

function measurementDraftFrom(variant: ProductVariantDetail): MeasurementDraft {
  return {
    weight: variant.weight ?? '',
    length: variant.length ?? '',
    width: variant.width ?? '',
    height: variant.height ?? '',
  };
}

/**
 * Medidas físicas (peso/dimensões) já existem por variação no banco (nunca precisou de campo
 * novo) — esta aba só organiza o preenchimento por TAMANHO: variações que só diferem pela cor
 * têm a mesma medida física de verdade, então preencher uma vez já salva pra todas as cores
 * daquele tamanho; tamanhos diferentes continuam precisando de medida própria (pedido do usuário).
 */
function MedidasTab({ productId, product }: { productId: string; product: { variants: ProductVariantDetail[] } }) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = React.useState<Record<string, MeasurementDraft>>({});
  const [savingKey, setSavingKey] = React.useState<string | null>(null);

  const groups = React.useMemo(() => {
    const map = new Map<string, ProductVariantDetail[]>();
    for (const variant of product.variants) {
      const key = variant.size ?? NO_SIZE_GROUP_KEY;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(variant);
    }
    return [...map.entries()];
  }, [product.variants]);

  function draftFor(key: string, variants: ProductVariantDetail[]): MeasurementDraft {
    return drafts[key] ?? measurementDraftFrom(variants[0]);
  }

  function setField(key: string, variants: ProductVariantDetail[], field: keyof MeasurementDraft, value: string) {
    setDrafts((d) => ({ ...d, [key]: { ...draftFor(key, variants), [field]: value } }));
  }

  async function handleSave(key: string, variants: ProductVariantDetail[]) {
    const draft = draftFor(key, variants);
    const data = {
      weight: draft.weight === '' ? undefined : Number(draft.weight),
      length: draft.length === '' ? undefined : Number(draft.length),
      width: draft.width === '' ? undefined : Number(draft.width),
      height: draft.height === '' ? undefined : Number(draft.height),
    };

    setSavingKey(key);
    try {
      // Uma variação de cada vez, todas com o MESMO valor — nunca existe um endpoint de
      // atualização em lote, mas todas pertencem ao mesmo grupo (mesmo tamanho) de propósito.
      await Promise.all(
        variants.map((v) => apiFetch(`/products/variants/${v.id}`, { method: 'PATCH', body: data })),
      );
      queryClient.invalidateQueries({ queryKey: ['products', productId] });
      toast({
        title: variants.length > 1 ? `Medidas salvas para ${variants.length} variações.` : 'Medidas salvas.',
      });
    } catch (error) {
      toast({
        title: 'Não foi possível salvar as medidas',
        description: error instanceof ApiError ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="space-y-4">
      {groups.map(([key, variants]) => {
        const draft = draftFor(key, variants);
        const sizeLabel = variants[0].size ?? 'Sem tamanho definido';
        const colorLabels = variants.map((v) => v.color ?? v.sku).join(', ');
        return (
          <Card key={key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                {sizeLabel}
                {variants.length > 1 && <span className="ml-2 text-xs font-normal text-muted-foreground">{colorLabels}</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 pt-0 sm:grid-cols-5 sm:items-end">
              <div className="space-y-1.5">
                <Label>Peso (kg)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={draft.weight}
                  onChange={(e) => setField(key, variants, 'weight', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Comprimento (cm)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.length}
                  onChange={(e) => setField(key, variants, 'length', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Largura (cm)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.width}
                  onChange={(e) => setField(key, variants, 'width', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Altura (cm)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.height}
                  onChange={(e) => setField(key, variants, 'height', e.target.value)}
                />
              </div>
              <Button size="sm" disabled={savingKey === key} onClick={() => handleSave(key, variants)}>
                {savingKey === key ? 'Salvando...' : variants.length > 1 ? `Salvar (${variants.length} cores)` : 'Salvar'}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function VendasTab({ productId }: { productId: string }) {
  const { data, isLoading } = useOrders({ productId, page: 1, pageSize: 20 });

  if (isLoading || !data) return <Skeleton className="h-48" />;
  if (data.items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma venda encontrada para este produto.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>Pedido</TableHead>
          <TableHead>Canal</TableHead>
          <TableHead>Valor</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.items.map((order) => (
          <TableRow key={order.id}>
            <TableCell>{formatDate(order.orderDate)}</TableCell>
            <TableCell>
              <Link href={`/vendas/pedidos/${order.id}`} className="hover:underline">
                {order.externalOrderId ?? order.id.slice(0, 8)}
              </Link>
            </TableCell>
            <TableCell>{order.channelName}</TableCell>
            <TableCell>{formatBRL(order.total)}</TableCell>
            <TableCell>{order.status}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CanaisTab({ productId }: { productId: string }) {
  const { data, isLoading } = useProductChannels(productId);

  if (isLoading || !data) return <Skeleton className="h-48" />;
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhum vínculo com canais de marketplace ainda.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>SKU</TableHead>
          <TableHead>Canal</TableHead>
          <TableHead>SKU externo</TableHead>
          <TableHead>Status de sincronização</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((mapping) => (
          <TableRow key={mapping.id}>
            <TableCell>{mapping.sku}</TableCell>
            <TableCell>{mapping.channelName}</TableCell>
            <TableCell>{mapping.externalSku ?? '—'}</TableCell>
            <TableCell>{mapping.syncStatus}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function HistoricoTab({ productId }: { productId: string }) {
  const { data, isLoading } = useAuditLogs({ entity: 'product', page: 1, pageSize: 20 });
  const filtered = data?.items.filter((log) => log.entityId === productId) ?? [];

  if (isLoading) return <Skeleton className="h-48" />;
  if (filtered.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nenhum evento de auditoria para este produto.</p>;
  }

  return (
    <div className="space-y-2">
      {filtered.map((log) => (
        <div key={log.id} className="flex items-center justify-between rounded-md border border-border px-4 py-2 text-sm">
          <span className="font-medium">{log.action}</span>
          <span className="text-muted-foreground">{log.user?.name ?? 'Sistema'}</span>
          <span className="text-muted-foreground">{formatDate(log.createdAt, true)}</span>
        </div>
      ))}
    </div>
  );
}
