'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type { Paginated } from '@/lib/types/pagination';
import { toast } from '@/components/ui/use-toast';

export interface InventoryRow {
  variantId: string;
  sku: string;
  productName: string;
  onHand: number;
  available: number;
  reserved: number;
  minStock: number;
  belowMinimum: boolean;
  estimatedValue: number;
}

export interface InventorySummary {
  totalSkus: number;
  totalUnits: number;
  estimatedValue: number;
  belowMinimumCount: number;
}

export interface InventoryMovement {
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  type: string;
  quantity: number;
  previousOnHand: number;
  newOnHand: number;
  previousReserved: number;
  newReserved: number;
  referenceType: string | null;
  referenceId: string | null;
  reason: string | null;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
}

export function useInventory(filters: { search?: string; belowMinimumOnly?: boolean; page?: number; pageSize?: number }) {
  const query = buildQueryString({ page: filters.page ?? 1, pageSize: filters.pageSize ?? 20, ...filters });
  return useQuery({
    queryKey: ['inventory', filters],
    queryFn: () => apiFetch<Paginated<InventoryRow>>(`/inventory${query}`),
  });
}

export function useInventorySummary() {
  return useQuery({
    queryKey: ['inventory-summary'],
    queryFn: () => apiFetch<InventorySummary>('/inventory/summary'),
  });
}

export interface SlowMovingItem {
  variantId: string;
  sku: string;
  productName: string;
  onHand: number;
  estimatedValue: number;
  lastSaleAt: string | null;
  daysSinceLastSale: number | null;
}

export interface RestockSuggestionItem {
  variantId: string;
  sku: string;
  productName: string;
  available: number;
  minStock: number;
  coverageDays: number | null;
  reason: 'below_minimum' | 'low_coverage';
}

export interface InventoryInsights {
  slowMovingDays: number;
  restockCoverageDays: number;
  slowMoving: SlowMovingItem[];
  restockSuggestions: RestockSuggestionItem[];
}

/** Estoque parado + sugestão de reposição (seções 33-36 da Fase 4). */
export function useInventoryInsights() {
  return useQuery({
    queryKey: ['inventory-insights'],
    queryFn: () => apiFetch<InventoryInsights>('/inventory/insights'),
  });
}

export function useInventoryMovements(filters: {
  variantId?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}) {
  const query = buildQueryString({ page: filters.page ?? 1, pageSize: filters.pageSize ?? 20, ...filters });
  return useQuery({
    queryKey: ['inventory-movements', filters],
    queryFn: () => apiFetch<Paginated<InventoryMovement>>(`/inventory/movements${query}`),
  });
}

export interface MovementResult {
  onHand: number;
  reserved: number;
  available: number;
}

export function useCreateMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { variantId: string; type: string; quantity: number; reason: string; note?: string }) =>
      apiFetch<MovementResult>('/inventory/movements', { method: 'POST', body: data }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-summary'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      // Feedback específico (seção 60 da Fase 4) — nunca um "Sucesso" genérico.
      toast({
        title: 'Movimentação registrada com sucesso.',
        description: `Estoque atualizado para ${result.onHand} unidades (${result.available} disponíveis).`,
      });
    },
    onError: (error) =>
      toast({
        title: 'Não foi possível registrar a movimentação',
        description: error instanceof ApiError ? error.message : undefined,
        variant: 'destructive',
      }),
  });
}
