'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@/components/ui/use-toast';

export interface IntegrationSummary {
  provider: 'TIKTOK_SHOP' | 'SHOPEE' | 'MERCADO_LIVRE';
  status: 'DISCONNECTED' | 'CONNECTED' | 'ERROR' | 'COMING_SOON';
  storeName: string | null;
  lastSyncAt: string | null;
  channelId: string | null;
}

export interface IntegrationDetail extends IntegrationSummary {
  ordersCount: number;
  productsMappedCount: number;
}

export function useIntegrations() {
  return useQuery({ queryKey: ['integrations'], queryFn: () => apiFetch<IntegrationSummary[]>('/integrations') });
}

export function useIntegration(provider: string) {
  return useQuery({
    queryKey: ['integrations', provider],
    queryFn: () => apiFetch<IntegrationDetail>(`/integrations/${provider}`),
  });
}

export function useIntegrationAction(provider: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: 'connect' | 'sync' | 'reconnect' | 'disconnect') =>
      apiFetch(`/integrations/${provider}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
    onError: (error) => {
      toast({
        title: error instanceof ApiError ? error.message : 'Ação não disponível nesta etapa.',
      });
    },
  });
}
