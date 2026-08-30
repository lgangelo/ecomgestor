'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type { Paginated } from '@/lib/types/pagination';
import { toast } from '@/components/ui/use-toast';

export interface ProductListItem {
  id: string;
  name: string;
  baseSku: string;
  brand: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'DRAFT';
  categoryName: string | null;
  imageUrl: string | null;
  variantCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  totalAvailable: number;
}

export interface ProductVariantDetail {
  id: string;
  sku: string;
  barcode: string | null;
  color: string | null;
  size: string | null;
  weight: string | null;
  length: string | null;
  width: string | null;
  height: string | null;
  suggestedPrice: string;
  minStock: number;
  status: 'ACTIVE' | 'INACTIVE';
  latestCost: string | null;
  inventory: { available: number; reserved: number };
}

export interface ProductDetail {
  id: string;
  name: string;
  description: string | null;
  brand: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'DRAFT';
  baseSku: string;
  imageUrl: string | null;
  category: { id: string; name: string } | null;
  variants: ProductVariantDetail[];
}

export interface ProductFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  status?: string;
  brand?: string;
}

export function useProducts(filters: ProductFilters) {
  const query = buildQueryString({ page: filters.page ?? 1, pageSize: filters.pageSize ?? 20, ...filters });
  return useQuery({
    queryKey: ['products', filters],
    queryFn: () => apiFetch<Paginated<ProductListItem>>(`/products${query}`),
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: ['products', id],
    queryFn: () => apiFetch<ProductDetail>(`/products/${id}`),
    enabled: Boolean(id),
  });
}

function useErrorToast() {
  return (title: string) => (error: unknown) =>
    toast({
      title,
      description: error instanceof ApiError ? error.message : undefined,
      variant: 'destructive',
    });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  const onErrorToast = useErrorToast();
  return useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      categoryId?: string;
      brand?: string;
      baseSku: string;
      imageUrl?: string;
      status?: string;
    }) => apiFetch<ProductDetail>('/products', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Produto criado com sucesso.' });
    },
    onError: onErrorToast('Não foi possível criar o produto'),
  });
}

export function useUpdateProduct(id: string) {
  const queryClient = useQueryClient();
  const onErrorToast = useErrorToast();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch<ProductDetail>(`/products/${id}`, { method: 'PATCH', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Produto atualizado.' });
    },
    onError: onErrorToast('Não foi possível atualizar o produto'),
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  const onErrorToast = useErrorToast();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/products/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Produto excluído.' });
    },
    onError: onErrorToast('Não foi possível excluir o produto'),
  });
}

export interface BulkDeleteProductsResult {
  deleted: string[];
  failed: Array<{ id: string; error: string }>;
}

export function useBulkDeleteProducts() {
  const queryClient = useQueryClient();
  const onErrorToast = useErrorToast();
  return useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch<BulkDeleteProductsResult>('/products/bulk-delete', { method: 'POST', body: { ids } }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({
        title:
          result.failed.length === 0
            ? `${result.deleted.length} produto(s) excluído(s).`
            : `${result.deleted.length} excluído(s), ${result.failed.length} não puderam ser excluídos (já têm pedido/movimentação).`,
        variant: result.failed.length === 0 ? undefined : 'destructive',
      });
    },
    onError: onErrorToast('Não foi possível excluir os produtos selecionados'),
  });
}

export function useCreateVariant(productId: string) {
  const queryClient = useQueryClient();
  const onErrorToast = useErrorToast();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch(`/products/${productId}/variants`, { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', productId] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Variação (SKU) criada com sucesso.' });
    },
    onError: onErrorToast('Não foi possível criar a variação'),
  });
}

export function useUpdateVariant(productId: string, variantId: string) {
  const queryClient = useQueryClient();
  const onErrorToast = useErrorToast();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch(`/products/variants/${variantId}`, { method: 'PATCH', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', productId] });
      toast({ title: 'Variação atualizada.' });
    },
    onError: onErrorToast('Não foi possível atualizar a variação'),
  });
}

export interface CostHistoryEntry {
  id: string;
  cost: string;
  effectiveDate: string;
  note: string | null;
}

export function useCostHistory(variantId: string | undefined) {
  return useQuery({
    queryKey: ['cost-history', variantId],
    queryFn: () => apiFetch<CostHistoryEntry[]>(`/products/variants/${variantId}/cost-history`),
    enabled: Boolean(variantId),
  });
}

export function useCreateCostHistory(productId: string, variantId: string) {
  const queryClient = useQueryClient();
  const onErrorToast = useErrorToast();
  return useMutation({
    mutationFn: (data: { cost: number; effectiveDate: string; note?: string }) =>
      apiFetch(`/products/variants/${variantId}/cost-history`, { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-history', variantId] });
      queryClient.invalidateQueries({ queryKey: ['products', productId] });
      toast({ title: 'Novo custo registrado.' });
    },
    onError: onErrorToast('Não foi possível registrar o custo'),
  });
}

// -----------------------------------------------------------------------
// Abas da página de produto (seção 4)
// -----------------------------------------------------------------------

export interface ProductSummary {
  productId: string;
  name: string;
  status: string;
  available: number;
  reserved: number;
  currentCost: number | null;
  suggestedPrice: number | null;
  avgSoldPrice30d: number | null;
  unitsSold30d: number;
  revenue30d: number;
  estimatedProfit30d: number;
  avgMargin30d: number | null;
}

export function useProductSummary(productId: string | undefined) {
  return useQuery({
    queryKey: ['products', productId, 'summary'],
    queryFn: () => apiFetch<ProductSummary>(`/products/${productId}/summary`),
    enabled: Boolean(productId),
  });
}

export interface ProductMovement {
  id: string;
  variantId: string;
  variant: { sku: string };
  type: string;
  quantity: number;
  reason: string | null;
  note: string | null;
  createdAt: string;
}

export function useProductMovements(productId: string | undefined) {
  return useQuery({
    queryKey: ['products', productId, 'movements'],
    queryFn: () => apiFetch<ProductMovement[]>(`/products/${productId}/movements`),
    enabled: Boolean(productId),
  });
}

export interface ProductCostHistoryEntry {
  id: string;
  sku: string | null;
  cost: string;
  effectiveDate: string;
  note: string | null;
}

export function useProductCostHistory(productId: string | undefined) {
  return useQuery({
    queryKey: ['products', productId, 'cost-history'],
    queryFn: () => apiFetch<ProductCostHistoryEntry[]>(`/products/${productId}/cost-history`),
    enabled: Boolean(productId),
  });
}

export interface ProductChannelMapping {
  id: string;
  sku: string | null;
  channelName: string;
  channelType: string;
  externalProductId: string | null;
  externalSku: string | null;
  syncStatus: string;
}

export function useProductChannels(productId: string | undefined) {
  return useQuery({
    queryKey: ['products', productId, 'channels'],
    queryFn: () => apiFetch<ProductChannelMapping[]>(`/products/${productId}/channels`),
    enabled: Boolean(productId),
  });
}
