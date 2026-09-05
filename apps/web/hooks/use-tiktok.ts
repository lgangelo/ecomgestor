'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiUrl, ApiError } from '@/lib/api-client';
import { toast } from '@/components/ui/use-toast';

export interface TikTokStatus {
  configured: boolean;
  connected: boolean;
  status: 'DISCONNECTED' | 'CONNECTED' | 'DEGRADED' | 'AUTH_EXPIRED' | 'ERROR' | 'COMING_SOON';
  channelId?: string | null;
  storeName?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  checkpoints?: { ordersSyncAt?: string; productsSyncAt?: string; financeSyncAt?: string };
  last24h?: { ordersImported: number; webhooksReceived: number; failures: number };
  pendingMappingCount?: number;
  autoInventorySyncEnabled?: boolean;
  areas?: {
    oauth: string;
    orders: string;
    products: string;
    finance: string;
    webhooks: string;
    fiscal: string;
  };
}

export interface UnmatchedTikTokProduct {
  externalProductId?: string;
  externalSku: string;
  sellerSku?: string;
  name: string;
  price: string;
  stock: number;
  imageUrl?: string;
  color?: string;
  size?: string;
  suggestedVariantId?: string;
  suggestedSku?: string;
  ambiguous: boolean;
}

export interface InventoryComparisonRow {
  variantId: string;
  sku: string;
  externalSku: string;
  central: number;
  tiktok: number | null;
  divergent: boolean;
  /** Seção 54 da Fase 4 — separa o status do outbox (PENDENTE/ERRO) da divergência ao vivo. */
  status: 'OK' | 'PENDENTE' | 'DIVERGENTE' | 'ERRO';
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface TikTokFailedJob {
  id: string;
  type: string;
  relatedExternalId: string | null;
  attempts: number;
  maxAttempts: number;
  errorCategory: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface TikTokOrderReconciliation {
  settled: boolean;
  grossSale?: number | null;
  sellerDiscount?: number;
  platformDiscount?: number;
  fees?: number;
  shippingAdjustment?: number;
  affiliateCommission?: number;
  settlementPayout?: number;
  other?: number;
  netRevenue?: number | null;
  paidAt?: string | null;
}

function connectUrl(): string {
  return apiUrl('/integrations/tiktok/connect');
}

export function useTikTokStatus() {
  return useQuery({
    queryKey: ['tiktok', 'status'],
    queryFn: () => apiFetch<TikTokStatus>('/integrations/tiktok/status'),
    refetchInterval: 30_000,
  });
}

export function useTikTokUnmatchedProducts(enabled: boolean) {
  return useQuery({
    queryKey: ['tiktok', 'products', 'unmatched'],
    queryFn: () => apiFetch<UnmatchedTikTokProduct[]>('/integrations/tiktok/products/unmatched'),
    enabled,
  });
}

function useTikTokMutation<TInput>(path: string, invalidate: string[][] = []) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => apiFetch(path, { method: 'POST', body: input }),
    onSuccess: () => {
      invalidate.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    },
    onError: (error) => {
      toast({ title: error instanceof ApiError ? error.message : 'Não foi possível concluir a ação.' });
    },
  });
}

export function useLinkTikTokProduct() {
  return useTikTokMutation<{ externalSku: string; externalProductId?: string; variantId: string }>(
    '/integrations/tiktok/products/link',
    [['tiktok', 'products', 'unmatched']],
  );
}

export function useIgnoreTikTokProduct() {
  return useTikTokMutation<{ externalSku: string; externalProductId?: string }>(
    '/integrations/tiktok/products/ignore',
    [['tiktok', 'products', 'unmatched']],
  );
}

export function useCreateTikTokProduct() {
  return useTikTokMutation<{
    externalSku: string;
    externalProductId?: string;
    name: string;
    sku: string;
    price: string;
    stock?: number;
    imageUrl?: string;
    color?: string;
    size?: string;
  }>('/integrations/tiktok/products/create', [['tiktok', 'products', 'unmatched'], ['orders']]);
}

export interface BulkCreateTikTokProductsResult {
  created: number;
  failed: Array<{ externalSku: string; error: string }>;
}

export function useBulkCreateTikTokProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      items: Array<{
        externalSku: string;
        externalProductId?: string;
        name: string;
        sku?: string;
        price: string;
        stock?: number;
        imageUrl?: string;
        color?: string;
        size?: string;
      }>,
    ) =>
      apiFetch<BulkCreateTikTokProductsResult>('/integrations/tiktok/products/bulk-create', {
        method: 'POST',
        body: { items },
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['tiktok', 'products', 'unmatched'] });
      toast({
        title:
          result.failed.length === 0
            ? `${result.created} produto(s) criado(s) com sucesso.`
            : `${result.created} criado(s), ${result.failed.length} falharam.`,
        variant: result.failed.length === 0 ? undefined : 'destructive',
      });
    },
    onError: (error) => {
      toast({ title: error instanceof ApiError ? error.message : 'Não foi possível concluir a criação em lote.' });
    },
  });
}

export interface SyncLinkedTikTokProductsResult {
  updated: number;
  unchanged: number;
  notFoundOnTikTok: number;
  failed: Array<{ externalSku: string; error: string }>;
}

/** Atualiza (nunca cria) preço/estoque dos produtos já vinculados a partir dos dados atuais da
 * TikTok — usa o SKU externo já gravado no vínculo, não duplica nada. */
export function useSyncLinkedTikTokProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<SyncLinkedTikTokProductsResult>('/integrations/tiktok/products/sync-linked', { method: 'POST' }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['tiktok', 'products', 'unmatched'] });
      toast({
        title:
          result.failed.length === 0
            ? `${result.updated} atualizado(s), ${result.unchanged} já estavam em dia.`
            : `${result.updated} atualizado(s), ${result.failed.length} falharam.`,
        variant: result.failed.length === 0 ? undefined : 'destructive',
      });
    },
    onError: (error) => {
      toast({ title: error instanceof ApiError ? error.message : 'Não foi possível sincronizar os produtos vinculados.' });
    },
  });
}

export function useStartTikTokImport() {
  return useTikTokMutation<{ importProducts?: boolean; importOrders?: boolean; ordersSince?: string }>(
    '/integrations/tiktok/import',
    [['tiktok', 'status']],
  );
}

export function useTikTokSyncNow() {
  return useTikTokMutation<void>('/integrations/tiktok/sync', [['tiktok', 'status']]);
}

export function useTikTokInventoryCompare() {
  return useQuery({
    queryKey: ['tiktok', 'inventory', 'compare'],
    queryFn: () => apiFetch<InventoryComparisonRow[]>('/integrations/tiktok/inventory/compare'),
  });
}

export function useTikTokInventoryPushEnabled() {
  return useQuery({
    queryKey: ['tiktok', 'inventory', 'push-enabled'],
    queryFn: () => apiFetch<{ enabled: boolean }>('/integrations/tiktok/inventory/push-enabled'),
  });
}

export function usePushTikTokInventory() {
  return useTikTokMutation<{ variantId: string }>('/integrations/tiktok/inventory/push', [
    ['tiktok', 'inventory', 'compare'],
  ]);
}

/** Toggle por integração (Bloco 2) — substitui o antigo interruptor único em Configurações →
 * Empresa, que afetava TikTok e Mercado Livre juntos. */
export function useSetTikTokAutoSync() {
  return useTikTokMutation<{ enabled: boolean }>('/integrations/tiktok/inventory/auto-sync', [
    ['tiktok', 'status'],
  ]);
}

export function useTikTokFailedJobs() {
  return useQuery({
    queryKey: ['tiktok', 'jobs'],
    queryFn: () => apiFetch<TikTokFailedJob[]>('/integrations/tiktok/jobs'),
  });
}

export function useRetryTikTokJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => apiFetch(`/integrations/tiktok/jobs/${jobId}/retry`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tiktok', 'jobs'] }),
    onError: (error) => {
      toast({ title: error instanceof ApiError ? error.message : 'Não foi possível reprocessar o job.' });
    },
  });
}

export function useReprocessTikTokOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => apiFetch(`/integrations/tiktok/orders/${orderId}/reprocess`, { method: 'POST' }),
    onSuccess: (_, orderId) => {
      queryClient.invalidateQueries({ queryKey: ['orders', orderId] });
      queryClient.invalidateQueries({ queryKey: ['tiktok', 'status'] });
    },
    onError: (error) => {
      toast({ title: error instanceof ApiError ? error.message : 'Não foi possível reprocessar o pedido.' });
    },
  });
}

/** Busca o pedido direto na TikTok e reaplica status/estoque, sem depender do checkpoint da
 * sincronização periódica — usado quando um pedido fica "preso" num status antigo. */
export function useResyncTikTokOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => apiFetch(`/integrations/tiktok/orders/${orderId}/resync`, { method: 'POST' }),
    onSuccess: (_, orderId) => {
      queryClient.invalidateQueries({ queryKey: ['orders', orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({ title: 'Pedido ressincronizado com a TikTok.' });
    },
    onError: (error) => {
      toast({ title: error instanceof ApiError ? error.message : 'Não foi possível ressincronizar o pedido.' });
    },
  });
}

export function useTikTokOrderReconciliation(orderId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['tiktok', 'orders', orderId, 'reconciliation'],
    queryFn: () => apiFetch<TikTokOrderReconciliation>(`/integrations/tiktok/orders/${orderId}/reconciliation`),
    enabled,
  });
}

export function useTikTokDisconnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch('/integrations/tiktok/disconnect', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tiktok', 'status'] }),
    onError: (error) => {
      toast({ title: error instanceof ApiError ? error.message : 'Não foi possível desconectar.' });
    },
  });
}

export function connectTikTok(): void {
  window.location.href = connectUrl();
}
