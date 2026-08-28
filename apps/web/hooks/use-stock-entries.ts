'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type { Paginated } from '@/lib/types/pagination';
import { toast } from '@/components/ui/use-toast';

export interface StockEntryListItem {
  id: string;
  entryDate: string;
  supplierName: string | null;
  invoiceNumber: string | null;
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
  itemCount: number;
}

export interface StockEntryItem {
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitCost: string;
}

export interface StockEntryDetail {
  id: string;
  entryDate: string;
  invoiceNumber: string | null;
  notes: string | null;
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
  supplier: { id: string; name: string } | null;
  items: StockEntryItem[];
}

export function useStockEntries(filters: { status?: string; page?: number; pageSize?: number }) {
  const query = buildQueryString({ page: filters.page ?? 1, pageSize: filters.pageSize ?? 20, ...filters });
  return useQuery({
    queryKey: ['stock-entries', filters],
    queryFn: () => apiFetch<Paginated<StockEntryListItem>>(`/stock-entries${query}`),
  });
}

export function useStockEntry(id: string | undefined) {
  return useQuery({
    queryKey: ['stock-entries', id],
    queryFn: () => apiFetch<StockEntryDetail>(`/stock-entries/${id}`),
    enabled: Boolean(id),
  });
}

function onErrorToast(title: string) {
  return (error: unknown) =>
    toast({ title, description: error instanceof ApiError ? error.message : undefined, variant: 'destructive' });
}

export function useCreateStockEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      supplierId?: string;
      entryDate: string;
      invoiceNumber?: string;
      notes?: string;
      status?: 'DRAFT' | 'CONFIRMED';
      items: Array<{ variantId: string; quantity: number; unitCost: number }>;
    }) => apiFetch<StockEntryDetail>('/stock-entries', { method: 'POST', body: data }),
    onSuccess: (entry) => {
      queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast({
        title: entry.status === 'CONFIRMED' ? 'Entrada confirmada e estoque atualizado.' : 'Entrada salva como rascunho.',
      });
    },
    onError: onErrorToast('Não foi possível registrar a entrada de estoque'),
  });
}

export function useConfirmStockEntry(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<StockEntryDetail>(`/stock-entries/${id}/confirm`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
      queryClient.invalidateQueries({ queryKey: ['stock-entries', id] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast({ title: 'Entrada confirmada e estoque atualizado.' });
    },
    onError: onErrorToast('Não foi possível confirmar a entrada'),
  });
}
