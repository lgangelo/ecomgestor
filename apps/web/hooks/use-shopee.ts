'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiUrl, ApiError } from '@/lib/api-client';
import { toast } from '@/components/ui/use-toast';

export interface ShopeeStatus {
  configured: boolean;
  connected: boolean;
  status: 'DISCONNECTED' | 'CONNECTED' | 'DEGRADED' | 'AUTH_EXPIRED' | 'ERROR';
  channelId?: string | null;
  storeName?: string | null;
  lastError?: string | null;
}

export function useShopeeStatus() {
  return useQuery({
    queryKey: ['shopee', 'status'],
    queryFn: () => apiFetch<ShopeeStatus>('/integrations/shopee/status'),
    refetchInterval: 30_000,
  });
}

export function useShopeeDisconnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch('/integrations/shopee/disconnect', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shopee', 'status'] }),
    onError: (error) => {
      toast({ title: error instanceof ApiError ? error.message : 'Não foi possível desconectar.' });
    },
  });
}

function connectUrl(): string {
  return apiUrl('/integrations/shopee/connect');
}

export function connectShopee(): void {
  window.location.href = connectUrl();
}
