'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiUrl, ApiError } from '@/lib/api-client';
import { toast } from '@/components/ui/use-toast';

export interface MercadoLivreStatus {
  configured: boolean;
  connected: boolean;
  status: 'DISCONNECTED' | 'CONNECTED' | 'DEGRADED' | 'AUTH_EXPIRED' | 'ERROR';
  channelId?: string | null;
  storeName?: string | null;
  lastError?: string | null;
  lastSyncAt?: string | null;
  checkpoints?: { ordersSyncAt?: string };
  autoInventorySyncEnabled?: boolean;
}

export interface MercadoLivreInventoryComparisonRow {
  variantId: string;
  sku: string;
  externalSku: string;
  central: number;
  mercadoLivre: number | null;
  divergent: boolean;
  status: 'OK' | 'PENDENTE' | 'DIVERGENTE' | 'ERRO';
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface MercadoLivreFailedJob {
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

export function useMercadoLivreStatus() {
  return useQuery({
    queryKey: ['mercadolivre', 'status'],
    queryFn: () => apiFetch<MercadoLivreStatus>('/integrations/mercadolivre/status'),
    refetchInterval: 30_000,
  });
}

export function useMercadoLivreDisconnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch('/integrations/mercadolivre/disconnect', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mercadolivre', 'status'] }),
    onError: (error) => {
      toast({ title: error instanceof ApiError ? error.message : 'Não foi possível desconectar.' });
    },
  });
}

export function useMercadoLivreInventoryCompare() {
  return useQuery({
    queryKey: ['mercadolivre', 'inventory', 'compare'],
    queryFn: () => apiFetch<MercadoLivreInventoryComparisonRow[]>('/integrations/mercadolivre/inventory/compare'),
  });
}

export function useMercadoLivreInventoryPushEnabled() {
  return useQuery({
    queryKey: ['mercadolivre', 'inventory', 'push-enabled'],
    queryFn: () => apiFetch<{ enabled: boolean }>('/integrations/mercadolivre/inventory/push-enabled'),
  });
}

export function usePushMercadoLivreInventory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variantId: string) =>
      apiFetch('/integrations/mercadolivre/inventory/push', { method: 'POST', body: { variantId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mercadolivre', 'inventory', 'compare'] }),
    onError: (error) => {
      toast({ title: error instanceof ApiError ? error.message : 'Não foi possível enviar o estoque.' });
    },
  });
}

/** Toggle por integração (Bloco 2) — substitui o antigo interruptor único em Configurações →
 * Empresa, que afetava TikTok e Mercado Livre juntos. */
export function useSetMercadoLivreAutoSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      apiFetch('/integrations/mercadolivre/inventory/auto-sync', { method: 'POST', body: { enabled } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mercadolivre', 'status'] }),
    onError: (error) => {
      toast({ title: error instanceof ApiError ? error.message : 'Não foi possível alterar a sincronização automática.' });
    },
  });
}

export function useMercadoLivreFailedJobs() {
  return useQuery({
    queryKey: ['mercadolivre', 'jobs'],
    queryFn: () => apiFetch<MercadoLivreFailedJob[]>('/integrations/mercadolivre/jobs'),
  });
}

export function useRetryMercadoLivreJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => apiFetch(`/integrations/mercadolivre/jobs/${jobId}/retry`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mercadolivre', 'jobs'] }),
    onError: (error) => {
      toast({ title: error instanceof ApiError ? error.message : 'Não foi possível reprocessar o job.' });
    },
  });
}

function connectUrl(): string {
  return apiUrl('/integrations/mercadolivre/connect');
}

export function connectMercadoLivre(): void {
  window.location.href = connectUrl();
}
