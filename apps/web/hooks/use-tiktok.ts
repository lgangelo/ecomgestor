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
  externalProductId: string;
  externalSku: string;
  sellerSku?: string;
  name: string;
  price: string;
  stock: number;
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
  return useTikTokMutation<{ externalSku: string; externalProductId?: string; name: string; sku: string; price: string }>(
    '/integrations/tiktok/products/create',
    [['tiktok', 'products', 'unmatched']],
  );
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
