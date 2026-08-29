'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type { Paginated } from '@/lib/types/pagination';
import { toast } from '@/components/ui/use-toast';
import { formatBRL } from '@ecommerce-manager/shared';

/** Feedback específico ao confirmar uma entrada (seção 60 da Fase 4) — nunca um "Sucesso"
 * genérico: mostra unidades e o novo custo (unitário, já com rateio de frete/outros custos). */
function describeConfirmedEntry(entry: StockEntryDetail): string | undefined {
  if (entry.status !== 'CONFIRMED' || entry.items.length === 0) return undefined;
  const totalQuantity = entry.items.reduce((sum, item) => sum + item.quantity, 0);
  if (entry.items.length === 1) {
    const item = entry.items[0];
    const cost = item.effectiveUnitCost ?? item.unitCost;
    return `Estoque atualizado: +${item.quantity} ${item.sku}. Novo custo: ${formatBRL(Number(cost))}.`;
  }
  return `Estoque atualizado: ${entry.items.length} produtos, ${totalQuantity} unidades no total.`;
}

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
  effectiveUnitCost: string | null;
}

export interface StockEntryDetail {
  id: string;
  entryDate: string;
  invoiceNumber: string | null;
  notes: string | null;
  shippingCost: string;
  otherCosts: string;
  allocationMethod: 'BY_VALUE' | 'BY_QUANTITY';
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
      shippingCost?: number;
      otherCosts?: number;
      allocationMethod?: 'BY_VALUE' | 'BY_QUANTITY';
      status?: 'DRAFT' | 'CONFIRMED';
      items: Array<{ variantId: string; quantity: number; unitCost: number }>;
    }) => apiFetch<StockEntryDetail>('/stock-entries', { method: 'POST', body: data }),
    onSuccess: (entry) => {
      queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast({
        title: entry.status === 'CONFIRMED' ? 'Entrada registrada com sucesso.' : 'Entrada salva como rascunho.',
        description: describeConfirmedEntry(entry),
      });
    },
    onError: onErrorToast('Não foi possível registrar a entrada de estoque'),
  });
}

export function useConfirmStockEntry(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<StockEntryDetail>(`/stock-entries/${id}/confirm`, { method: 'PATCH' }),
    onSuccess: (entry) => {
      queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
      queryClient.invalidateQueries({ queryKey: ['stock-entries', id] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast({ title: 'Entrada confirmada.', description: describeConfirmedEntry(entry) });
    },
    onError: onErrorToast('Não foi possível confirmar a entrada'),
  });
}
