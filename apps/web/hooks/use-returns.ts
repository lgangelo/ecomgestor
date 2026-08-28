'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type { Paginated } from '@/lib/types/pagination';
import { toast } from '@/components/ui/use-toast';

export interface ReturnListItem {
  id: string;
  orderId: string;
  customerName: string | null;
  channelName: string;
  reason: string | null;
  status: string;
  requestedAt: string;
}

export interface ReturnDetail {
  id: string;
  orderId: string;
  reason: string | null;
  status: string;
  requestedAt: string;
  resolvedAt: string | null;
  order: { id: string; customerName: string | null };
  items: Array<{
    id: string;
    quantity: number;
    condition: string | null;
    orderItem: { variant: { sku: string; product: { name: string } } };
  }>;
  refunds: Array<{ id: string; amount: string; method: string | null; status: string }>;
}

function onErrorToast(title: string) {
  return (error: unknown) =>
    toast({ title, description: error instanceof ApiError ? error.message : undefined, variant: 'destructive' });
}

export function useReturns(filters: { status?: string; page?: number; pageSize?: number }) {
  const query = buildQueryString({ page: filters.page ?? 1, pageSize: filters.pageSize ?? 20, ...filters });
  return useQuery({
    queryKey: ['returns', filters],
    queryFn: () => apiFetch<Paginated<ReturnListItem>>(`/returns${query}`),
  });
}

export function useReturn(id: string | undefined) {
  return useQuery({
    queryKey: ['returns', id],
    queryFn: () => apiFetch<ReturnDetail>(`/returns/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateReturn(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      reason?: string;
      items: Array<{ orderItemId: string; quantity: number; condition?: string; restockOnReturn?: boolean }>;
    }) => apiFetch<ReturnDetail>(`/orders/${orderId}/returns`, { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      queryClient.invalidateQueries({ queryKey: ['orders', orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast({ title: 'Devolução registrada.' });
    },
    onError: onErrorToast('Não foi possível registrar a devolução'),
  });
}

export function useCreateRefund(returnId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { type: 'FULL' | 'PARTIAL'; amount: number; method?: string; externalReference?: string }) =>
      apiFetch(`/returns/${returnId}/refunds`, { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      toast({ title: 'Reembolso registrado.' });
    },
    onError: onErrorToast('Não foi possível registrar o reembolso'),
  });
}

export function useUpdateReturnStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { status: string; resolvedAt?: string }) =>
      apiFetch(`/returns/${id}/status`, { method: 'PATCH', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      toast({ title: 'Status da devolução atualizado.' });
    },
    onError: onErrorToast('Não foi possível atualizar a devolução'),
  });
}
