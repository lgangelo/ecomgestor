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

function connectUrl(): string {
  return apiUrl('/integrations/mercadolivre/connect');
}

export function connectMercadoLivre(): void {
  window.location.href = connectUrl();
}
