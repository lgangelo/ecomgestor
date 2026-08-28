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

export function useCreateMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { variantId: string; type: string; quantity: number; reason: string; note?: string }) =>
      apiFetch('/inventory/movements', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-summary'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      toast({ title: 'Movimentação registrada com sucesso.' });
    },
    onError: (error) =>
      toast({
        title: 'Não foi possível registrar a movimentação',
        description: error instanceof ApiError ? error.message : undefined,
        variant: 'destructive',
      }),
  });
}
