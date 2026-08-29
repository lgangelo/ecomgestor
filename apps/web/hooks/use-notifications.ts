'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

export interface Notification {
  id: string;
  category: 'ESTOQUE' | 'PEDIDO' | 'FISCAL' | 'INTEGRACAO' | 'FINANCEIRO' | 'SISTEMA';
  title: string;
  message: string;
  link: string | null;
  readAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

const UNREAD_COUNT_POLL_MS = 60_000;

export function useNotifications(unreadOnly: boolean) {
  const query = buildQueryString({ unreadOnly });
  return useQuery({
    queryKey: ['notifications', { unreadOnly }],
    queryFn: () => apiFetch<Notification[]>(`/notifications${query}`),
  });
}

/** Contagem do sino (seção 41) — atualizada periodicamente, não só quando o painel abre. */
export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => apiFetch<{ count: number }>('/notifications/unread-count'),
    refetchInterval: UNREAD_COUNT_POLL_MS,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ count: number }>('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });
}
