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
  // Só preenchidos pra falhas de publicação de produto (type "mercadolivre-publish-product-color")
  // — contexto suficiente pra mostrar/editar direto nesta tela, sem abrir outra.
  variantId?: string | null;
  productId?: string | null;
  productName?: string | null;
  sku?: string | null;
  color?: string | null;
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

/** Corrige a cor da variante direto na tela de Falhas (pedido do usuário: editar e reenviar sem
 * abrir outra tela) e, em seguida, tenta a publicação de novo — duas chamadas já existentes
 * (atualizar variação + retry de job), nunca um endpoint novo. */
export function useFixMercadoLivreColorAndRetry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId, variantId, color }: { jobId: string; variantId: string; color: string }) => {
      await apiFetch(`/products/variants/${variantId}`, { method: 'PATCH', body: { color } });
      await apiFetch(`/integrations/mercadolivre/jobs/${jobId}/retry`, { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mercadolivre', 'jobs'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Cor corrigida — publicação reenviada.' });
    },
    onError: (error) => {
      toast({ title: error instanceof ApiError ? error.message : 'Não foi possível corrigir e reenviar.' });
    },
  });
}

function connectUrl(): string {
  return apiUrl('/integrations/mercadolivre/connect');
}

export function connectMercadoLivre(): void {
  window.location.href = connectUrl();
}
